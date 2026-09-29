import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appendAudit } from '../src/modules/audit/audit.repository.js';
import { assertNoSensitiveKeys } from '../src/shared/security/sensitive-data.js';

const entityId = randomUUID();
const actorId = randomUUID();
const requestId = randomUUID();

describe('appendAudit', () => {
  it('inserts explicit columns in parameter order and returns the stored row', async () => {
    const stored = { id: randomUUID(), action: 'publication.created', metadata: { channel: 'web' } };
    const db = { query: vi.fn().mockResolvedValue({ rows: [stored] }) };
    const oldValues = { status: 'Borrador' };
    const newValues = { status: 'Activa' };
    const metadata = { channel: 'web' };

    await expect(appendAudit(db, {
      actorId, action: 'publication.created', entityType: 'publication', entityId,
      oldValues, newValues, requestId, metadata,
    })).resolves.toBe(stored);

    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audit_logs\s*\(actor_id, action, entity_type, entity_id, old_values, new_values, request_id, metadata\)/i);
    expect(sql).toMatch(/VALUES\s*\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*\$5,\s*\$6,\s*\$7,\s*\$8\)/i);
    expect(sql).toMatch(/RETURNING\s+\*/i);
    expect(params).toEqual([actorId, 'publication.created', 'publication', entityId,
      oldValues, newValues, requestId, metadata]);
    expect(params[4]).toEqual(oldValues);
    expect(params[5]).toEqual(newValues);
    expect(params[7]).toEqual(metadata);
    expect(params.slice(4, 6).every(value => typeof value === 'object')).toBe(true);
  });

  it('uses nullable audit columns and empty metadata when optional values are absent', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: entityId }] }) };
    await appendAudit(db, { action: 'system.started', entityType: 'system', entityId });
    expect(db.query.mock.calls[0][1]).toEqual([
      null, 'system.started', 'system', entityId, null, null, null, {},
    ]);
  });

  it('treats explicit null snapshots as SQL NULL', async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ id: entityId }] }) };
    await appendAudit(db, {
      action: 'system.started', entityType: 'system', entityId,
      oldValues: null, newValues: null,
    });
    expect(db.query.mock.calls[0][1].slice(4, 6)).toEqual([null, null]);
  });

  it.each([
    ['oldValues', []], ['oldValues', 'previous'],
    ['newValues', [{ status: 'Activa' }]], ['newValues', 'current'],
  ])('rejects %s snapshot %s before querying', async (field, snapshot) => {
    const db = { query: vi.fn() };
    await expect(appendAudit(db, {
      action: 'test', entityType: 'test', entityId, [field]: snapshot,
    })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects invalid required fields before querying', async () => {
    const db = { query: vi.fn() };
    await expect(appendAudit(db, { action: '', entityType: 'publication', entityId })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects non-JSON audit snapshots rather than silently dropping their fields', async () => {
    const db = { query: vi.fn() };
    await expect(appendAudit(db, {
      action: 'test', entityType: 'test', entityId,
      newValues: { status: 'Activa', callback: () => 'omitted by JSON.stringify' },
    })).rejects.toThrow();
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each([
    [{ PASSWORD: 'secret-value' }, 'metadata'],
    [{ nested: { ToKeN: 'secret-value' } }, 'oldValues'],
    [{ nested: [{ OTP: 'secret-value' }] }, 'newValues'],
    [{ card: [{ PaN: 'secret-value' }] }, 'metadata'],
    [{ nested: { CvV: 'secret-value' } }, 'metadata'],
  ])('rejects forbidden keys in %s before querying', async (value, field) => {
    const db = { query: vi.fn() };
    const event = { action: 'test', entityType: 'test', entityId, [field]: value };
    await expect(appendAudit(db, event)).rejects.toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
    expect(db.query).not.toHaveBeenCalled();
    try {
      await appendAudit(db, event);
    } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });

  it.each([
    ['oldValues', { PaSsWoRd: undefined }],
    ['newValues', { nested: [{ ToKeN: () => 'private-marker-582' }] }],
    ['metadata', { CvV: () => 'private-marker-582' }],
  ])('rejects raw forbidden keys in %s before JSON validation', async (field, value) => {
    const db = { query: vi.fn() };
    const event = { action: 'test', entityType: 'test', entityId, [field]: value };
    let thrown;
    try {
      await appendAudit(db, event);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: 'AUDIT_SENSITIVE_DATA' });
    expect(String(thrown)).not.toContain('private-marker-582');
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('assertNoSensitiveKeys', () => {
  it('accepts safe nested objects and arrays', () => {
    expect(() => assertNoSensitiveKeys({ changes: [{ status: 'Activa' }] }, 'metadata')).not.toThrow();
  });

  it('reports a sensitive key without exposing its value', () => {
    expect(() => assertNoSensitiveKeys([{ nested: { ToKeN: 'private-marker-582' } }], 'metadata'))
      .toThrowError(expect.objectContaining({ code: 'AUDIT_SENSITIVE_DATA' }));
    try {
      assertNoSensitiveKeys([{ nested: { ToKeN: 'private-marker-582' } }], 'metadata');
    } catch (error) {
      expect(String(error)).not.toContain('private-marker-582');
    }
  });
});
