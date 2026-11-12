import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import ArcoForm from './ArcoForm';
import { apiRequest } from '../../lib/api';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn(), apiBlob: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getSession: () => ({ token: 'session', user: { email: 'ana@ucsm.edu.pe' } }) }));

const record = {
  id: '6ba9c70a-47be-43e9-a4fe-b01a26781683', reference: 'ARCO-6BA9C70A', type: 'Rectificacion',
  status: 'Presentada', createdAt: '2026-11-11T12:00:00.000Z', dataScope: 'Correo de mi perfil',
  description: 'El correo registrado está desactualizado.', evidence: [], history: [], revision: 1,
};

beforeEach(() => vi.clearAllMocks());

it('shows a tracking reference only after the case is recorded', async () => {
  apiRequest.mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce(record).mockResolvedValueOnce({ items: [record] });
  render(<MemoryRouter><ArcoForm /></MemoryRouter>);
  await screen.findByText('Aún no tienes expedientes.');
  fireEvent.click(screen.getByRole('radio', { name: /Rectificación/ }));
  fireEvent.change(screen.getByLabelText(/Datos sobre los que solicitas atención/), { target: { value: record.dataScope } });
  fireEvent.change(screen.getByLabelText(/Describe tu solicitud/), { target: { value: record.description } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo mi identidad/ }));
  fireEvent.click(screen.getByRole('button', { name: /Registrar solicitud ARCO/ }));
  expect(await screen.findByText(/Solicitud registrada.*ARCO-6BA9C70A/)).toBeInTheDocument();
  expect(apiRequest).toHaveBeenCalledWith('/privacy/requests', expect.objectContaining({ method: 'POST', token: 'session', body: expect.any(String) }));
});

it('leaves the application editable after a server failure', async () => {
  apiRequest.mockResolvedValueOnce({ items: [] }).mockRejectedValueOnce(new Error('Servicio temporalmente no disponible.'));
  render(<MemoryRouter><ArcoForm /></MemoryRouter>);
  await screen.findByText('Aún no tienes expedientes.');
  fireEvent.change(screen.getByLabelText(/Datos sobre los que solicitas atención/), { target: { value: record.dataScope } });
  fireEvent.change(screen.getByLabelText(/Describe tu solicitud/), { target: { value: record.description } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo mi identidad/ }));
  fireEvent.click(screen.getByRole('button', { name: /Registrar solicitud ARCO/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Servicio temporalmente no disponible.');
  expect(screen.getByLabelText(/Describe tu solicitud/)).toHaveValue(record.description);
});
