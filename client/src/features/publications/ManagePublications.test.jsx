import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ManagePublications from './ManagePublications';
import { apiRequest } from '../../lib/api';
import { change, click, session, publication } from '../../test/workflows';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); session(); });
function setup() { render(<MemoryRouter><ManagePublications /></MemoryRouter>); }
it.each([['Activa', 'Pausar', 'pause', 'Pausada'], ['Pausada', 'Reactivar', 'reactivate', 'Pendiente de revisión'], ['Borrador', 'Enviar', 'submit', 'Pendiente de revisión'], ['Pendiente de revisión', 'Retirar', 'withdraw', 'Retirada']])('confirms %s lifecycle before requesting %s', async (status, label, action, result) => {
  apiRequest.mockResolvedValueOnce([{ ...publication, status }]).mockResolvedValueOnce({ ...publication, status: result }); setup(); await screen.findByText('Calculadora'); click(label); expect(apiRequest).toHaveBeenCalledTimes(1); expect(screen.getByRole('dialog')).toHaveTextContent(label); click('Confirmar');
  expect(await screen.findByText(`Estado: ${result}`)).toBeInTheDocument(); expect(apiRequest).toHaveBeenLastCalledWith(`/publications/pub-1/${action}`, expect.objectContaining({ method: 'POST', token: 'real-token' }));
});
it('cancel leaves the publication untouched and blocked-operation errors preserve the current state', async () => {
  apiRequest.mockResolvedValueOnce([{ ...publication, status: 'Activa' }]).mockRejectedValueOnce(Object.assign(new Error('El estado actual impide esta acción.'), { status: 409 })); setup(); await screen.findByText('Calculadora'); click('Pausar'); click('Cancelar'); expect(apiRequest).toHaveBeenCalledTimes(1); click('Pausar'); click('Confirmar');
  expect(await screen.findByRole('alert')).toHaveTextContent(/operaci[oó]n.*activa|operaciones activas/); expect(screen.getByText('Estado: Activa')).toBeInTheDocument();
});
it('edits a draft through PATCH with the actual existing values', async () => {
  apiRequest.mockResolvedValueOnce([publication]).mockResolvedValueOnce({ ...publication, title: 'Calculadora actualizada' }); setup(); await screen.findByText('Calculadora'); click('Editar'); expect(screen.getByLabelText('Precio (S/)')).toHaveValue(500); change('Título', 'Calculadora actualizada'); click('Guardar cambios');
  expect(await screen.findByText('Calculadora actualizada')).toBeInTheDocument(); await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/publications/pub-1', expect.objectContaining({ method: 'PATCH' })));
});
it('handles loading, empty, retry and session permission states', async () => {
  apiRequest.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce([]); setup(); expect(screen.getByRole('status')).toHaveTextContent(/Cargando/); expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión'); click('Actualizar publicaciones'); expect(await screen.findByText('Todavía no tienes publicaciones.')).toBeInTheDocument();
});
it('does not fetch own publications without a session', () => {
  sessionStorage.clear(); setup(); expect(screen.getByRole('alert')).toHaveTextContent(/Inicia sesión/); expect(apiRequest).not.toHaveBeenCalled();
});
it('can save an incomplete draft with a null price while preserving its optional fields', async () => {
  const draft = { ...publication, title: 'Borrador parcial', price: null, guarantee_amount: null, images: [], risk_level: null };
  apiRequest.mockResolvedValueOnce([draft]).mockResolvedValueOnce({ ...draft, title: 'Título corregido' }); setup(); await screen.findByText('Borrador parcial'); click('Editar'); change('Título', 'Título corregido'); click('Guardar cambios');
  expect(await screen.findByText('Título corregido')).toBeInTheDocument(); expect(JSON.parse(apiRequest.mock.calls[1][1].body).price).toBeNull();
});
