import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Operations from './Operations';
import { apiRequest } from '../../lib/api';
import { session } from '../../test/workflows';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
const base = { id: 'op-1', publication_id: 'pub-1', modality: 'Venta', status: 'Pendiente',
  start_date: null, end_date: null, requested_price: '125.00', requested_guarantee_amount: '0.00',
  requested_contract_version: 4, request_expires_at: '2026-10-03T12:00:00Z', accepted_at: null,
  decided_at: null, cancelled_at: null, decision_reason: null, cancellation_reason: null,
  created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z', contract_snapshot: null,
  allowed_actions: ['cancel'], publication: { id: 'pub-1', title: 'Calculadora', primary_image: null, contract_version: 4 },
  counterpart: { id: 'owner-1', display_name: 'Oferente', reputation_score: '4.2', operations_count: 2 } };
const page = items => ({ items, limit: 20, offset: 0 });
function setup() { render(<MemoryRouter><Operations /></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); session(); });

it('shows outgoing loading, pending terms and expiry, then received empty state', async () => {
  let resolve;
  apiRequest.mockReturnValueOnce(new Promise(done => { resolve = done; })).mockResolvedValueOnce(page([]));
  setup(); expect(screen.getByRole('status')).toHaveTextContent(/Cargando/);
  resolve(page([base]));
  const card = await screen.findByRole('article', { name: /Calculadora/ });
  expect(card).toHaveTextContent('Pendiente');
  expect(card).toHaveTextContent('S/ 125.00');
  expect(card).toHaveTextContent(/Vence/);
  fireEvent.click(screen.getByRole('button', { name: 'Recibidas' }));
  expect(await screen.findByText('No tienes solicitudes recibidas.')).toBeInTheDocument();
  expect(apiRequest.mock.calls[0][0]).toBe('/operations/mine?side=requested');
  expect(apiRequest.mock.calls[1][0]).toBe('/operations/mine?side=received');
});

it('accepts only after confirmation and displays the server refreshed state', async () => {
  const incoming = { ...base, allowed_actions: ['accept', 'reject'] };
  apiRequest.mockResolvedValueOnce(page([])).mockResolvedValueOnce(page([incoming]))
    .mockResolvedValueOnce({ operation: { ...incoming, status: 'Aceptada', allowed_actions: [], accepted_at: '2026-10-01T13:00:00Z' } })
    .mockResolvedValueOnce(page([{ ...incoming, status: 'Aceptada', allowed_actions: [], accepted_at: '2026-10-01T13:00:00Z' }]));
  setup(); fireEvent.click(screen.getByRole('button', { name: 'Recibidas' }));
  await screen.findByRole('article', { name: /Calculadora/ });
  fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
  expect(apiRequest).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('dialog')).toHaveTextContent(/servidor/);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar aceptar' }));
  expect(await screen.findByText('Aceptada')).toBeInTheDocument();
  expect(apiRequest.mock.calls[2]).toEqual(['/operations/op-1/accept', expect.objectContaining({ token: 'real-token', method: 'POST' })]);
  expect(apiRequest.mock.calls[3][0]).toBe('/operations/mine?side=received');
  expect(within(screen.getByRole('article', { name: /Calculadora/ })).getByText(/Pagos, garantías y entrega aún no disponibles/)).toBeInTheDocument();
});

it.each([['Rechazar', 'reject', 'Recibidas', ['accept', 'reject']], ['Cancelar', 'cancel', 'Enviadas', ['cancel']]])('requires a normalized reason before %s and refreshes the list', async (label, action, tab, allowed) => {
    const item = { ...base, allowed_actions: allowed };
    apiRequest.mockResolvedValueOnce(page(tab === 'Enviadas' ? [item] : []));
    if (tab === 'Recibidas') apiRequest.mockResolvedValueOnce(page([item]));
    apiRequest.mockResolvedValueOnce({ operation: { ...item, status: action === 'reject' ? 'Rechazada' : 'Cancelada', allowed_actions: [] } })
      .mockResolvedValueOnce(page([{ ...item, status: action === 'reject' ? 'Rechazada' : 'Cancelada', allowed_actions: [] }]));
    setup(); if (tab === 'Recibidas') fireEvent.click(screen.getByRole('button', { name: tab }));
    await screen.findByRole('article', { name: /Calculadora/ });
    fireEvent.click(screen.getByRole('button', { name: label }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: `Confirmar ${label.toLowerCase()}` }));
    expect(screen.getByRole('alert')).toHaveTextContent(/motivo/);
    fireEvent.change(within(dialog).getByLabelText('Motivo'), { target: { value: '  No disponible  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: `Confirmar ${label.toLowerCase()}` }));
    await waitFor(() => expect(apiRequest.mock.calls.some(([path]) => path === `/operations/op-1/${action}`)).toBe(true));
    const call = apiRequest.mock.calls.find(([path]) => path === `/operations/op-1/${action}`);
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'No disponible' });
    expect(await screen.findByText(action === 'reject' ? 'Rechazada' : 'Cancelada')).toBeInTheDocument();
  });

it('shows terminal labels and does not offer actions absent from allowed_actions', async () => {
  const statuses = ['Rechazada', 'Cancelada', 'Expirada', 'Cancelación en reversión'];
  apiRequest.mockResolvedValueOnce(page(statuses.map((status, index) => ({ ...base, id: `op-${index}`, status,
    publication: { ...base.publication, title: `Artículo ${index}` }, allowed_actions: [] }))));
  setup(); await screen.findByText('Artículo 0');
  for (const status of statuses) expect(screen.getByText(status)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
});

it('shows conflicts, permissions and lets participants refresh a failed list', async () => {
  apiRequest.mockRejectedValueOnce(Object.assign(new Error('Acceso denegado.'), { status: 403 })).mockResolvedValueOnce(page([base]))
    .mockRejectedValueOnce(Object.assign(new Error('El estado actual impide esta acción.'), { status: 409 }))
    .mockResolvedValueOnce(page([{ ...base, status: 'Expirada', allowed_actions: [] }]));
  setup(); expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado.');
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar operaciones' }));
  await screen.findByRole('article', { name: /Calculadora/ });
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Ya no lo necesito' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/impide esta acción/);
  expect(await screen.findByText('Expirada')).toBeInTheDocument();
});

it('fetches private detail only when opened and hides other participant data', async () => {
  apiRequest.mockResolvedValueOnce(page([base])).mockResolvedValueOnce({ operation: base });
  setup(); await screen.findByRole('article', { name: /Calculadora/ });
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
  expect(await screen.findByRole('dialog', { name: 'Detalle de operación' })).toHaveTextContent('Oferente');
  expect(apiRequest.mock.calls[1][0]).toBe('/operations/op-1');
  expect(screen.queryByText(/otp_code|password|evidence_ref/)).not.toBeInTheDocument();
});

it('discards an outgoing detail response after switching to received operations', async () => {
  let resolveDetail;
  apiRequest.mockResolvedValueOnce(page([base]))
    .mockReturnValueOnce(new Promise(done => { resolveDetail = done; }))
    .mockResolvedValueOnce(page([]));
  setup(); await screen.findByRole('article', { name: /Calculadora/ });
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recibidas' }));
  expect(await screen.findByText('No tienes solicitudes recibidas.')).toBeInTheDocument();
  resolveDetail({ operation: base });
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(screen.queryByRole('dialog', { name: 'Detalle de operación' })).not.toBeInTheDocument();
});

it('closes stale detail after a conflicting decision and shows the refreshed status', async () => {
  apiRequest.mockResolvedValueOnce(page([base])).mockResolvedValueOnce({ operation: base })
    .mockRejectedValueOnce(Object.assign(new Error('El estado actual impide esta acción.'), { status: 409 }))
    .mockResolvedValueOnce(page([{ ...base, status: 'Expirada', allowed_actions: [] }]));
  setup(); await screen.findByRole('article', { name: /Calculadora/ });
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
  expect(await screen.findByRole('dialog', { name: 'Detalle de operación' })).toHaveTextContent('Pendiente');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Ya no lo necesito' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/impide esta acción/);
  expect(await screen.findByText('Expirada')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Detalle de operación' })).not.toBeInTheDocument();
});

it('ignores a delayed detail response after a confirmed decision', async () => {
  let resolveDetail;
  apiRequest.mockResolvedValueOnce(page([base]))
    .mockReturnValueOnce(new Promise(done => { resolveDetail = done; }))
    .mockResolvedValueOnce({ operation: { ...base, status: 'Cancelada', allowed_actions: [] } })
    .mockResolvedValueOnce(page([{ ...base, status: 'Cancelada', allowed_actions: [] }]));
  setup(); await screen.findByRole('article', { name: /Calculadora/ });
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Ya no lo necesito' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelar' }));
  expect(await screen.findByText('Cancelada')).toBeInTheDocument();
  await act(async () => resolveDetail({ operation: base }));
  expect(screen.queryByRole('dialog', { name: 'Detalle de operación' })).not.toBeInTheDocument();
  expect(screen.getByRole('article', { name: /Calculadora/ })).toHaveTextContent('Cancelada');
});
