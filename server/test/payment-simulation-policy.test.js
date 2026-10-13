import { expect,it } from 'vitest';
import { simulationQuote } from '../src/modules/operations/payment-simulation.policy.js';
it.each([['hour',1.5,2],['day',25,2],['week',169,2],['month',721,2]])('rounds a %s rental to whole units without holding a guarantee', (unit,hours,expected)=>{
  const start='2026-10-13T05:00:00Z';
  const result=simulationQuote({modality:'Alquiler',contract_snapshot:{agreed_price:'10.00',rental_unit:unit},start_date:start,end_date:new Date(new Date(start).getTime()+hours*3600000).toISOString()});
  expect(result).toMatchObject({amount:'20.00',unit_count:expected,simulated:true,guarantee_held:false});
});
it('quotes a sale at its frozen offer amount and a free loan at zero',()=>{
  expect(simulationQuote({modality:'Venta',contract_snapshot:{agreed_price:'4.00'}}).amount).toBe('4.00');
  expect(simulationQuote({modality:'Préstamo',contract_snapshot:{agreed_price:'0.00'}}).amount).toBe('0.00');
});
