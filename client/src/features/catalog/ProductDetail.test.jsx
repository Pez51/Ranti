import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ProductDetail from './ProductDetail';
import { apiRequest } from '../../lib/api';
import { session } from '../../test/workflows';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
const sale = { id: 'pub-1', title: 'Calculadora', description: 'Equipo cuidado', category: 'Ingeniería',
  condition: 'Usado', modality: 'Venta', price: '125.00', guarantee_amount: '0.00',
  contract_version: 4, images: [], owner_reputation_score: '4.2', available_from: null,
  available_until: null };
function setup() { render(<MemoryRouter initialEntries={['/producto/pub-1']}><Routes>
  <Route path="/producto/:id" element={<ProductDetail />} />
  <Route path="/operaciones" element={<p>Mis operaciones</p>} />
</Routes></MemoryRouter>); }
beforeEach(() => { vi.resetAllMocks(); session(); });

it('asks confirmation with the displayed sale terms and sends no dates', async () => {
  apiRequest.mockResolvedValueOnce(sale).mockResolvedValueOnce({ operation: { id: 'op-1', status: 'Pendiente' } });
  setup(); await screen.findByText('Calculadora');
  fireEvent.click(screen.getByRole('button', { name: /Solicitar operación/ }));
  expect(screen.getByRole('dialog')).toHaveTextContent('S/ 125.00');
  expect(screen.getByRole('dialog')).toHaveTextContent('Versión 4');
  expect(apiRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar solicitud' }));
  expect(await screen.findByText(/Solicitud pendiente/)).toBeInTheDocument();
  const [path, options] = apiRequest.mock.calls[1];
  expect(path).toBe('/operations');
  expect(options).toMatchObject({ method: 'POST', token: 'real-token' });
  expect(JSON.parse(options.body)).toEqual({ publication_id: 'pub-1', requested_price: '125.00',
    requested_guarantee_amount: '0.00', requested_contract_version: 4 });
});

it.each(['Alquiler', 'Préstamo'])('requires valid dates and sends them for %s', async modality => {
  apiRequest.mockResolvedValueOnce({ ...sale, modality, price: modality === 'Préstamo' ? '0.00' : '25.00',
    guarantee_amount: '30.00', available_from: '2026-10-02T05:00:00Z', available_until: '2026-11-01T05:00:00Z' })
    .mockResolvedValueOnce({ operation: { id: 'op-2', status: 'Pendiente' } });
  setup(); await screen.findByText('Calculadora');
  fireEvent.click(screen.getByRole('button', { name: /Solicitar operación/ }));
  expect(screen.getByRole('alert')).toHaveTextContent(/fechas/);
  fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: '2026-10-03' } });
  fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-05' } });
  fireEvent.click(screen.getByRole('button', { name: /Solicitar operación/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar solicitud' }));
  await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({ start_date: '2026-10-03', end_date: '2026-10-05',
    requested_price: modality === 'Préstamo' ? '0.00' : '25.00', requested_guarantee_amount: '30.00' });
});

it('does not offer confirmation for dates outside the published window', async () => {
  apiRequest.mockResolvedValueOnce({ ...sale, modality: 'Alquiler', available_from: '2026-10-02T05:00:00Z',
    available_until: '2026-11-01T05:00:00Z' });
  setup(); await screen.findByText('Calculadora');
  fireEvent.change(screen.getByLabelText('Inicio'), { target: { value: '2026-10-01' } });
  fireEvent.change(screen.getByLabelText('Fin'), { target: { value: '2026-10-05' } });
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar operación' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/fechas válidas/);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledTimes(1);
});

it('shows server denial of an own-publication request without claiming success', async () => {
  apiRequest.mockResolvedValueOnce(sale).mockRejectedValueOnce(Object.assign(new Error('No puedes solicitar tu propia publicación.'), { status: 422 }));
  setup(); await screen.findByText('Calculadora');
  fireEvent.click(screen.getByRole('button', { name: 'Solicitar operación' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar solicitud' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/propia publicación/);
  expect(screen.getByRole('alert')).not.toHaveTextContent(/Actualiza la publicación/);
  expect(screen.queryByText(/Solicitud pendiente/)).not.toBeInTheDocument();
});

it('does not offer requests when publication detail is unavailable', async () => {
  apiRequest.mockRejectedValueOnce(Object.assign(new Error('Publicación no encontrada.'), { status: 404 }));
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Publicación no encontrada.');
  expect(screen.queryByRole('button', { name: 'Solicitar operación' })).not.toBeInTheDocument();
});

it('shows a server conflict and does not imply that a request was accepted', async () => {
  apiRequest.mockResolvedValueOnce(sale).mockRejectedValueOnce(Object.assign(new Error('La publicación no está disponible.'), { status: 409 }));
  setup(); await screen.findByText('Calculadora');
  fireEvent.click(screen.getByRole('button', { name: /Solicitar operación/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar solicitud' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/no está disponible/);
  expect(screen.queryByText(/Solicitud pendiente/)).not.toBeInTheDocument();
});

it('does not offer request submission without a session', async () => {
  sessionStorage.clear(); apiRequest.mockResolvedValueOnce(sale); setup(); await screen.findByText('Calculadora');
  expect(screen.queryByRole('button', { name: /Solicitar operación/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Inicia sesión/ })).toHaveAttribute('href', '/login');
});
