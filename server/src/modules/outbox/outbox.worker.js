import { claimOutboxBatch, completeOutboxEvent, failOutboxEvent } from './outbox.repository.js';

// db must be an autocommit Pool or idle Client. Handlers receive payload plus the
// stored event (including its stable id/deduplication_key for idempotent delivery).
export async function processOutboxBatch({ db, handlers, workerId, now = () => new Date() }) {
  const events = await claimOutboxBatch(db, { workerId });
  let processed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      const handler = Object.hasOwn(handlers, event.event_type) ? handlers[event.event_type] : undefined;
      if (typeof handler !== 'function') throw new Error('No registered outbox handler.');
      await handler(event.payload, event);
    } catch (error) {
      const nextAttempt = event.attempts + 1;
      const seconds = Math.min(2 ** Math.min(nextAttempt, 7) * 30, 3600);
      const retryAt = new Date(now().getTime() + seconds * 1000);
      if (await failOutboxEvent(db, { id: event.id, workerId, error, retryAt })) failed++;
      continue;
    }
    // A persistence error must propagate, not be misclassified as a handler error.
    if (await completeOutboxEvent(db, { id: event.id, workerId })) processed++;
  }
  return { processed, failed };
}
