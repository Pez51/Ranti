import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import PaymentSettings from './PaymentSettings';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
vi.mock('../../lib/auth', () => ({ getSession: () => ({ token: 'test-token' }) }));
const emptyProfile = { buyer_method: null, payout: null, accepted_methods: [], owner_ready: false };

beforeEach(() => vi.resetAllMocks());

it('guarda la referencia de prueba sin enviar campos de tarjeta', async () => {
  apiRequest.mockResolvedValueOnce(emptyProfile).mockResolvedValueOnce({ ...emptyProfile, buyer_method: 'tarjeta_prueba' });
  render(<MemoryRouter><PaymentSettings /></MemoryRouter>);
  const save = await screen.findByRole('button', { name: 'Guardar tarjeta de prueba' });
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Completar con datos de prueba' }));
  expect(save).toBeEnabled();
  fireEvent.click(save);
  expect(await screen.findByText(/Visa •••• 4242/)).toBeInTheDocument();
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ action: 'buyer', method: 'tarjeta_prueba' });
});

it('ordena la verificación del destino y la selección de medios antes de publicar', async () => {
  const payout = { label: 'Cuenta bancaria de prueba', last_four: '4321' };
  apiRequest.mockResolvedValueOnce(emptyProfile)
    .mockResolvedValueOnce({ ...emptyProfile, payout })
    .mockResolvedValueOnce({ ...emptyProfile, payout, accepted_methods: ['tarjeta_prueba'], owner_ready: true });
  render(<MemoryRouter initialEntries={['/perfil/pagos?rol=oferente']}><PaymentSettings /></MemoryRouter>);
  const card = await screen.findByRole('checkbox', { name: 'Tarjeta de prueba' });
  expect(card).toBeDisabled();
  expect(screen.queryByRole('link', { name: 'Continuar a publicar' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Completar cuenta de ejemplo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Verificar cuenta receptora de prueba' }));
  await screen.findByText(/•••• 4321/);
  expect(card).toBeEnabled();
  fireEvent.click(card);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar preferencias de cobro' }));
  expect(await screen.findByRole('link', { name: 'Continuar a publicar' })).toHaveAttribute('href', '/publicar');
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({ action: 'destination', channel: 'banco_prueba' });
});
