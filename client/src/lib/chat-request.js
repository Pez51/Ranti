import { apiRequest } from './api';

// Bound requests even when a network proxy never resolves. The message client
// keeps its idempotency key so a timed-out send can be retried safely.
export async function chatRequest(path, options = {}, timeoutMs = 12000) {
  const { signal, ...rest } = options;
  const controller = new AbortController();
  let timer, cancel;
  const interrupted = new Promise((_, reject) => {
    cancel = () => {
      const error = new DOMException('Solicitud cancelada.', 'AbortError');
      controller.abort(error); reject(error);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    timer = setTimeout(() => {
      const error = new Error('El chat tardó demasiado en responder. Revisa tu conexión y reintenta.');
      error.code = 'CHAT_TIMEOUT';
      controller.abort(error); reject(error);
    }, timeoutMs);
  });
  try { return await Promise.race([apiRequest(path, { ...rest, signal: controller.signal }), interrupted]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
