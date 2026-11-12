import { describe,it,expect } from 'vitest';
import { calculateFinance,processorFee,simulatedTariff,validateTariff,buyerQuote,ownerQuote } from '../src/modules/operations/finance.policy.js';
const op={modality:'Venta',requested_price:'40.00',requested_guarantee_amount:'0.00',oferente_id:'owner',demandante_id:'buyer'};
const tariff={...simulatedTariff,version:'fixture-NOT-A-REAL-TARIFF',percentage_ppm:50000,fixed_cents:100};
describe('finance exact cent policy',()=>{
 it.each(['5.00','40.00','60.00','999.99'])('preserves the existing fee and owner net for price %s',price=>{
  const e=calculateFinance({...op,requested_price:price},tariff);
  expect(BigInt(e.total_cents)-BigInt(e.processor_expected_cents)).toBe(BigInt(e.owner_cents)+BigInt(e.ranti_expected_cents));
  const gross=BigInt(price.replace('.','')),fee=(gross*BigInt(gross<6000n?10:5)+50n)/100n;
  expect(e.ranti_expected_cents).toBe(String(fee));expect(e.owner_cents).toBe(String(gross-fee));
 });
 it('grosses up percentage plus fixed cost on the entire charge',()=>{
  const e=calculateFinance(op,tariff);expect(e.total_cents).toBe('4316');expect(e.processor_expected_cents).toBe('316');
  expect(processorFee(BigInt(e.total_cents)-1n,tariff)+(BigInt(e.owner_cents)+BigInt(e.ranti_expected_cents))).toBeGreaterThan(BigInt(e.total_cents)-1n);
 });
 it.each(['ceil','floor','half_up'])('handles provider %s rounding, minimum fee and exclusive tax',rounding=>{
  const t={...tariff,rounding,minimum_fee_cents:333,tax_treatment:'exclusive',tax_ppm:180000};
  const e=calculateFinance(op,t);expect(BigInt(e.total_cents)-processorFee(e.total_cents,t)).toBe(4000n);
 });
 it('models charged guarantees as refundable liabilities and charges their processing too',()=>{
  const e=calculateFinance({...op,modality:'Alquiler',guarantee_required:true,requested_guarantee_amount:'1500.00',start_date:'2026-11-01T12:00:00Z',end_date:'2026-11-02T12:00:00Z'}, {...tariff,guarantee_policy:'charge_refundable'});
  expect(e.guarantee_charged_cents).toBe('150000');expect(e.owner_cents).toBe('3600');expect(e.ranti_expected_cents).toBe('400');
  expect(BigInt(e.total_cents)-BigInt(e.processor_expected_cents)-150000n).toBe(4000n);
 });
 it('retains the per-unit tier for rentals rather than inventing a new tier on the summed price',()=>{
  const e=calculateFinance({...op,modality:'Alquiler',start_date:'2026-11-01T12:00:00Z',end_date:'2026-11-03T12:00:00Z'},simulatedTariff);
  expect(e.ranti_expected_cents).toBe('800');expect(e.owner_cents).toBe('7200');expect(e.unit_count).toBe(2);
 });
 it('never charges a referential guarantee and freezes the accepted requirement',()=>{
  const rental={...op,modality:'Alquiler',requested_guarantee_amount:'100.00',start_date:'2026-11-01T12:00:00Z',end_date:'2026-11-02T12:00:00Z'};
  const t={...tariff,guarantee_policy:'charge_refundable'},referential=calculateFinance(rental,t);
  expect(referential.guarantee_charged_cents).toBe('0');expect(buyerQuote(referential).guarantee_note).toMatch(/referencial/);
  const required=calculateFinance({...rental,guarantee_required:true},t);
  expect(required.terms_key).not.toBe(referential.terms_key);
  const accepted={...rental,accepted_at:new Date(),guarantee_required:false,contract_snapshot:{agreed_price:'40.00',guarantee_amount:'100.00',guarantee_required:true,rental_unit:'day'}};
  expect(calculateFinance(accepted,t).guarantee_charged_cents).toBe('10000');
  expect(buyerQuote(calculateFinance(accepted,simulatedTariff)).guarantee_note).toMatch(/obligatoria.*no se cobra/);
 });
 it('never exposes the internal allocation through either public projection',()=>{
  const e=calculateFinance(op,tariff);
  for(const result of [buyerQuote(e),ownerQuote(e)]){expect(result).not.toHaveProperty('processor_expected_cents');expect(result).not.toHaveProperty('ranti_expected_cents');expect(result).not.toHaveProperty('tariff_snapshot');}
 });
 it('fails closed for unknown currency, unconfirmed rates and an impossible effective percentage',()=>{
  expect(()=>validateTariff({...tariff,currency:'USD'})).toThrow();expect(()=>validateTariff({...tariff,confirmed:false})).toThrow();
  expect(()=>validateTariff({...tariff,percentage_ppm:900000,tax_ppm:180000,tax_treatment:'exclusive'})).toThrow();
  expect(()=>calculateFinance(op,{...tariff,min_total_cents:50000})).toThrow(/mínimo/);
 });
});
