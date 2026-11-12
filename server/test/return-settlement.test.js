import { expect, it } from 'vitest';
import { distributeGuarantee } from '../src/modules/operations/return-settlement.js';

it('separa la devolución total, parcial y agotada sin cobrar el exceso', () => {
  expect(distributeGuarantee('20000', '0')).toEqual({ guarantee: '200.00', owner: '0.00', buyer: '200.00', excess: '0.00' });
  expect(distributeGuarantee('20000', '8000')).toEqual({ guarantee: '200.00', owner: '80.00', buyer: '120.00', excess: '0.00' });
  expect(distributeGuarantee('20000', '25000')).toEqual({ guarantee: '200.00', owner: '200.00', buyer: '0.00', excess: '50.00' });
});
