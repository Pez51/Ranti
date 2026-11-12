import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { saveSession } from '../../lib/auth';
import GraduateAccreditation from './GraduateAccreditation';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn(), apiBlob: vi.fn() }));
vi.mock('../../lib/auth', () => ({ saveSession: vi.fn() }));

const record = {
  id: '5ca02d3d-a3b1-4843-a00e-7107f4a08041', reference: 'ACR-5CA02D3D', status: 'En revisión', revision: 1,
  name: 'Ana López', documentLast4: '5678', faculty: null, career: null, reason: null, correction: null,
  createdAt: '2026-11-11T12:00:00.000Z', updatedAt: '2026-11-11T12:00:00.000Z',
  evidence: [{ id: '0a2588b3-5177-4ed6-bec7-a0c98218b22d', name: 'constancia.pdf', revision: 1, size: 50 }], history: [],
};

beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); });

it('registers a personal email and presents accreditation tracking without opening a Ranti session', async () => {
  apiRequest.mockImplementation(async path => {
    if (path.endsWith('/catalog')) return [];
    if (path.endsWith('/me')) return record;
    return { token: 'scoped-accreditation-token', application: record };
  });
  render(<MemoryRouter initialEntries={['/acreditacion?solicitar=1']}><GraduateAccreditation /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.org' } });
  fireEvent.change(screen.getByLabelText('Contraseña', { exact: true }), { target: { value: 'frase-segura' } });
  fireEvent.change(screen.getByLabelText('Confirmar contraseña', { exact: true }), { target: { value: 'frase-segura' } });
  fireEvent.change(screen.getByLabelText('Nombre y apellidos'), { target: { value: record.name } });
  fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '12345678' } });
  fireEvent.change(screen.getByLabelText('Constancia de egreso PDF'), { target: {
    files: [new File(['%PDF-1.7\n%%EOF'], 'constancia.pdf', { type: 'application/pdf' })],
  } });
  fireEvent.click(screen.getByLabelText('Acepto términos y privacidad'));
  fireEvent.click(screen.getByLabelText('Declaro que la información es correcta'));
  fireEvent.submit(screen.getByRole('button', { name: 'Enviar para revisión' }).closest('form'));
  expect(await screen.findByText(/Acreditación enviada.*ACR-5CA02D3D/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Estado de mi acreditación' })).toBeInTheDocument();
  expect(screen.queryByText('12345678')).not.toBeInTheDocument();
  expect(saveSession).not.toHaveBeenCalled();
  expect(apiRequest).toHaveBeenCalledWith('/auth/graduates/register', expect.objectContaining({
    headers: { 'Content-Type': 'application/vnd.ranti.accreditation+json' }, method: 'POST',
  }));
});
