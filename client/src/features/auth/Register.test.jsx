import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Register from './Register';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { change, click, user } from '../../test/workflows';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
const pending = { status: 'verification_pending', user: { ...user, status: 'Pendiente de verificación', verification_status: 'No verificado' }, challenge_id: 'challenge-1', expires_at: '2026-10-01T12:00:00Z', simulation_code: '123456' };
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear(); });
function setup() { render(<MemoryRouter><Register /></MemoryRouter>); change(/Correo institucional/i, ' ANA@UCSM.EDU.PE '); change('Contraseña', 'securepass'); }
it('rejects non-UCSM email and requires explicit terms before registration', async () => {
  setup(); change(/Correo institucional/i, 'ana@ucsm.edu.pe.evil.org'); click('Crear cuenta');
  expect(await screen.findByRole('alert')).toHaveTextContent(/UCSM/i); expect(apiRequest).not.toHaveBeenCalled();
  change(/Correo institucional/i, 'ana@ucsm.edu.pe'); click('Crear cuenta'); expect(screen.getByRole('alert')).toHaveTextContent(/términos/i);
});
it('normalizes registration, shows pilot code and only saves session after confirmation', async () => {
  apiRequest.mockResolvedValueOnce(pending).mockResolvedValueOnce({ token: 'confirmed-token', user });
  setup(); fireEvent.click(screen.getByLabelText(/Acepto los términos/)); click('Crear cuenta');
  expect(await screen.findByText(/Código de piloto\/prueba: 123456/)).toBeInTheDocument(); expect(getSession()).toBeNull();
  expect(apiRequest).toHaveBeenCalledWith('/auth/register', expect.objectContaining({ body: JSON.stringify({ email: 'ana@ucsm.edu.pe', password: 'securepass', acceptTerms: true, termsVersion: 'pilot-v1' }) }));
  change('Código de verificación', '123456'); click('Confirmar código');
  await waitFor(() => expect(getSession()?.token).toBe('confirmed-token'));
  expect(apiRequest).toHaveBeenLastCalledWith('/auth/verification/confirm', expect.objectContaining({ body: JSON.stringify({ challengeId: 'challenge-1', code: '123456' }) }));
});
it.each(['incorrecto', 'expirado', 'reutilizado', 'agotado'])('allows resend after a code is %s without inventing server distinctions', async () => {
  apiRequest.mockResolvedValueOnce(pending).mockRejectedValueOnce(new Error('Verificación inválida o no disponible.')).mockResolvedValueOnce({ ...pending, challenge_id: 'challenge-2' });
  setup(); fireEvent.click(screen.getByLabelText(/Acepto los términos/)); click('Crear cuenta'); await screen.findByLabelText('Código de verificación');
  change('Código de verificación', '000000'); click('Confirmar código'); expect(await screen.findByRole('alert')).toHaveTextContent('Verificación inválida o no disponible.');
  expect(getSession()).toBeNull(); click('Reenviar código'); await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/auth/verification/resend', expect.objectContaining({ body: JSON.stringify({ email: 'ana@ucsm.edu.pe' }) })));
});
it('recovers a provider outage with resend and disables duplicate pending requests', async () => {
  let resolve; apiRequest.mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(pending);
  setup(); fireEvent.click(screen.getByLabelText(/Acepto los términos/)); click('Crear cuenta'); expect(screen.getByRole('button', { name: /Creando/ })).toBeDisabled();
  resolve({ status: 'verification_unavailable', retryable: true, user: pending.user });
  expect(await screen.findByRole('status')).toHaveTextContent(/proveedor.*no está disponible/i); expect(getSession()).toBeNull(); click('Reenviar código'); expect(await screen.findByText(/Código de piloto/)).toBeInTheDocument();
});
it('shows duplicate-account feedback and offers recovery for an existing pending account', async () => {
  apiRequest.mockRejectedValueOnce(new Error('El correo ya está registrado.')).mockResolvedValueOnce(pending);
  setup(); fireEvent.click(screen.getByLabelText(/Acepto los términos/)); click('Crear cuenta'); expect(await screen.findByRole('alert')).toHaveTextContent('El correo ya está registrado.');
  click('Reenviar código'); expect(await screen.findByText(/Código de piloto/)).toBeInTheDocument();
});
