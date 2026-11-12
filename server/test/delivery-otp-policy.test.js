import { expect, it } from 'vitest';
import { handoffProjection } from '../src/modules/operations/handoff.policy.js';

it('solo el comprador puede ver el código de entrega de una operación nueva', () => {
  const operation = {
    oferente_id: 'owner', demandante_id: 'buyer', status: 'Lista para entrega',
    contract_snapshot: { workflow_payment: {} },
  };
  const row = { delivery_otp: '042175', delivery_otp_expires_at: new Date('2099-01-01'), delivery_otp_attempts: 0 };
  expect(handoffProjection(row, operation, 'buyer')).toMatchObject({ otp_required: true, delivery_code: '042175' });
  expect(handoffProjection(row, operation, 'owner')).toMatchObject({ otp_required: true, delivery_code: null });
});
