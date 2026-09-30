import { afterEach, expect, it, vi } from 'vitest';
import { apiRequest } from './api';
afterEach(() => vi.unstubAllGlobals());
it('preserves server string and structured errors with status and code', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: { message: 'La solicitud ya tiene otra decisión.', code: 'ROLE_REQUEST_CONFLICT' } }) }).mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: 'Verificación inválida o no disponible.', code: 'IDENTITY_INVALID_CHALLENGE' }) }));
  await expect(apiRequest('/admin/role-requests/1/decision')).rejects.toMatchObject({ message: 'La solicitud ya tiene otra decisión.', status: 409, code: 'ROLE_REQUEST_CONFLICT' });
  await expect(apiRequest('/auth/verification/confirm')).rejects.toMatchObject({ message: 'Verificación inválida o no disponible.', status: 400, code: 'IDENTITY_INVALID_CHALLENGE' });
});
