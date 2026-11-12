import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';

export const demoPaymentMethods = {
  tarjeta_prueba: 'Tarjeta de prueba',
  yape_prueba: 'Yape de prueba',
  plin_prueba: 'Plin de prueba',
};

const destinations = {
  banco_prueba: { label: 'Cuenta bancaria de prueba', last_four: '4321' },
  yape_prueba: { label: 'Cuenta Yape de prueba', last_four: '0101' },
  plin_prueba: { label: 'Cuenta Plin de prueba', last_four: '0202' },
};

const method = z.enum(Object.keys(demoPaymentMethods));
const change = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('buyer'), method }),
  z.strictObject({ action: z.literal('remove_buyer') }),
  z.strictObject({ action: z.literal('destination'), channel: z.enum(Object.keys(destinations)),
    scenario: z.enum(['verified_simulation','pending_simulation','observed_simulation','rejected_simulation']).optional() }),
  z.strictObject({ action: z.literal('accepted'), methods: z.array(method).min(1).max(3) }),
]);

export function paymentProfileChange(input) {
  const result = change.safeParse(input);
  if (!result.success) {
    throw new AppError({ status: 400, code: 'INVALID_PAYMENT_PROFILE',
      message: 'Revisa la configuración de pagos y cobros de prueba.', details: null });
  }
  return result.data;
}

export function paymentProfileView(row) {
  const channel = row?.payout_destination;
  const accepted = row?.accepted_methods ?? [];
  const status = row?.payout_status ?? 'verified_simulation';
  return {
    buyer_method: row?.buyer_method ?? null,
    payout: channel ? { channel, ...destinations[channel], status } : null,
    accepted_methods: accepted,
    owner_ready: Boolean(channel && status === 'verified_simulation' && accepted.length),
  };
}

export async function readPaymentProfile(db, userId) {
  const result = await db.query('SELECT * FROM user_payment_profiles WHERE user_id=$1', [userId]);
  return paymentProfileView(result.rows[0]);
}

export async function savePaymentProfile(db, userId, input) {
  const data = paymentProfileChange(input);
  let result;
  if (data.action === 'buyer') {
    result = await db.query(`INSERT INTO user_payment_profiles(user_id,buyer_method) VALUES($1,$2)
      ON CONFLICT(user_id) DO UPDATE SET buyer_method=EXCLUDED.buyer_method RETURNING *`, [userId, data.method]);
  } else if (data.action === 'remove_buyer') {
    result = await db.query(`UPDATE user_payment_profiles SET buyer_method=NULL WHERE user_id=$1 RETURNING *`, [userId]);
  } else if (data.action === 'destination') {
    result = await db.query(`INSERT INTO user_payment_profiles(user_id,payout_destination,payout_status) VALUES($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET payout_destination=EXCLUDED.payout_destination,payout_status=EXCLUDED.payout_status
      RETURNING *`, [userId, data.channel, data.scenario??'verified_simulation']);
  } else {
    result = await db.query(`UPDATE user_payment_profiles SET accepted_methods=$2
      WHERE user_id=$1 AND payout_destination IS NOT NULL AND payout_status='verified_simulation' RETURNING *`, [userId, [...new Set(data.methods)]]);
    if (!result.rowCount) {
      throw new AppError({ status: 409, code: 'PAYOUT_SETUP_REQUIRED',
        message: 'Verifica primero tu cuenta receptora de prueba.', details: null });
    }
  }
  return paymentProfileView(result.rows[0]);
}
