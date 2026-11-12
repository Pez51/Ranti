import { describe, expect, it } from 'vitest';
import { paymentProfileChange, paymentProfileView } from '../src/modules/users/payment-profile.service.js';

describe('configuración económica privada', () => {
  it('solo acepta la referencia de la tarjeta de prueba, sin datos de tarjeta', () => {
    expect(paymentProfileChange({ action: 'buyer', method: 'tarjeta_prueba' })).toEqual({
      action: 'buyer', method: 'tarjeta_prueba',
    });
    expect(() => paymentProfileChange({ action: 'buyer', method: 'tarjeta_prueba', cvv: '123' }))
      .toThrow('Revisa la configuración');
  });

  it('proyecta el destino de prueba y deja los cobros pendientes hasta elegir métodos', () => {
    const row = { buyer_method: null, payout_destination: 'banco_prueba', accepted_methods: [] };
    expect(paymentProfileView(row)).toMatchObject({
      buyer_method: null, payout: { channel: 'banco_prueba', last_four: '4321' }, owner_ready: false,
    });
    expect(paymentProfileView({ ...row, accepted_methods: ['tarjeta_prueba'] }).owner_ready).toBe(true);
  });
});
