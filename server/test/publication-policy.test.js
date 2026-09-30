import { describe, expect, it } from 'vitest';

import { evaluatePublicationRisk as evaluate } from '../src/modules/publications/risk.policy.js';
const rental = { modality: 'Alquiler', price: '10.00', guaranteeAmount: '0',
  availableFrom: '2026-10-01T00:00:00Z', availableUntil: '2026-10-03T00:00:00Z' };

describe('pilot-v1 exact publication policy', () => {
  it.each([['499.99', 1, false], ['500', 2, false], ['999.99', 2, false], ['1000', 3, true]])(
    'classifies exposure %s without rounding across a boundary', (price, level, evidence) => {
      expect(evaluate({ modality: 'Venta', price })).toEqual({ policyVersion: 'pilot-v1', level,
        requiresAdminReview: level > 1, requiresProvenanceEvidence: evidence,
        declaredExposure: `${price.includes('.') ? price : `${price}.00`}` });
    });
  it('uses the larger exact guarantee, accepts numeric cents and null loan price', () => {
    expect(evaluate({ ...rental, price: 499.99, guaranteeAmount: '0500.00' })).toMatchObject({ level: 2, declaredExposure: '500.00' });
    expect(evaluate({ ...rental, modality: 'Préstamo', price: null, guaranteeAmount: '1000.00' })).toMatchObject({ level: 3, declaredExposure: '1000.00' });
  });
  it.each(['499.999', '1e3', '-1', '', 'Infinity', '100000000', {}, true, NaN, Infinity])(
    'rejects invalid or unrepresentable money %j', price => {
      expect(() => evaluate({ modality: 'Venta', price })).toThrow();
    });
  it.each([
    { modality: 'Venta', price: 0 }, { modality: 'Venta', price: null },
    { modality: 'Venta', price: 1, guaranteeAmount: 1 },
    { modality: 'Venta', price: 1, availableFrom: rental.availableFrom },
    { ...rental, price: 0 }, { ...rental, guaranteeAmount: -1 },
    { ...rental, availableUntil: null }, { ...rental, availableFrom: '2026-02-30' },
    { ...rental, availableFrom: '0000-10-01' },
    { ...rental, availableFrom: rental.availableUntil },
    { ...rental, availableFrom: '2026-10-04' },
    { ...rental, modality: 'Préstamo', price: 1 },
    { ...rental, modality: 'Préstamo', availableFrom: null },
    { ...rental, modality: 'Unknown' }, { modality: 'Venta', price: 1, currency: 'USD' },
  ])('rejects contradictory economics or dates: %j', input => expect(() => evaluate(input)).toThrow());
  it.each([{ modality: 'Venta', price: '0.01' }, rental,
    { ...rental, modality: 'Préstamo', price: 0 }, { ...rental, modality: 'Préstamo', price: null }])(
    'accepts valid modality economics: %j', input => expect(evaluate(input).level).toBe(1));
  it('interprets date-only availability at Peru midnight, matching reservation dates', () => {
    expect(() => evaluate({ ...rental, availableFrom: '2026-10-01', availableUntil: '2026-10-01T03:00:00Z' })).toThrow();
  });
});
