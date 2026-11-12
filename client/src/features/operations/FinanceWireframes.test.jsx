import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import FinancePanel from './FinancePanel';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));

const attempt = {
  modality: 'Venta',
  operation_status: 'Pendiente de pago/garantía',
  payment: { id: 'attempt-1', status: 'pending', reference: 'sim-attempt', amount: '40.00',
    method: 'tarjeta_prueba', authorization_required: true },
  methods: [{ id: 'tarjeta_prueba', label: 'Tarjeta de prueba' }],
  documents: [],
  transfer: { status: 'blocked' },
};

beforeEach(() => vi.resetAllMocks());

it('keeps the same attempt through authorization and verification', async () => {
  const verified = { ...attempt, payment: { ...attempt.payment, authorization_required: false } };
  apiRequest.mockResolvedValueOnce(attempt).mockResolvedValueOnce(verified).mockResolvedValueOnce(verified);
  render(<FinancePanel operationId="op-1" token="token" defaultOpen />);

  fireEvent.click(await screen.findByRole('button', { name: 'Autorizar en el banco de prueba' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar este intento' }));
  expect(apiRequest.mock.calls.map(([path]) => path)).toEqual([
    '/operations/op-1/finance',
    '/operations/op-1/finance/payments/attempt-1/authorize',
    '/operations/op-1/finance/payments/attempt-1/consult',
  ]);
  expect(screen.queryByRole('button', { name: 'Confirmar pago de prueba' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Descargar constancia' })).not.toBeInTheDocument();
});
