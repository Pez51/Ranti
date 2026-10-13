import { expect,it } from 'vitest';
import { publicationPricing } from '../src/modules/publications/publication-pricing.js';
it.each([['180','9.00','171.00'],['5','0.50','4.50'],['0.10','0.01','0.09']])('deducts the applicable total service fee from %s', (price,fee,net)=>{
  const result=publicationPricing({modality:'Venta',price});
  expect(result.owner).toMatchObject({service_fee:fee,owner_net:net,guarantee_amount:'0.00',simulated:true});
  expect(result.owner).not.toHaveProperty('included_service_tax');
  expect(result.owner).not.toHaveProperty('card_fee');
});
it('does not charge commission on a loan or its guarantee',()=>{
  expect(publicationPricing({modality:'Préstamo',price:'0',guarantee_amount:'1000'}).owner).toMatchObject({service_fee:'0.00',owner_net:'0.00',guarantee_amount:'1000.00'});
});
it('keeps rental pricing per day and guarantee separate from income',()=>{
  expect(publicationPricing({modality:'Alquiler',price:'20',guarantee_amount:'500'}).owner).toMatchObject({unit:'día',service_fee:'2.00',service_fee_percent:10,owner_net:'18.00',guarantee_amount:'500.00'});
});
it('accounts for platform tax within the fee rather than adding a second owner deduction',()=>{
  expect(publicationPricing({modality:'Venta',price:'180'}).platform).toEqual({net_service_income:'7.63',included_service_tax:'1.37'});
});
it.each([['hour','hora'],['day','día'],['week','semana'],['month','mes (30 días)']])('quotes the rental rate per %s rather than assuming days',(rental_unit,unit)=>{
  expect(publicationPricing({modality:'Alquiler',price:'40',rental_unit}).owner).toMatchObject({unit,gross_amount:'40.00',owner_net:'36.00'});
});
it.each([['5',10,'0.50','4.50'],['59.99',10,'6.00','53.99'],['60',5,'3.00','57.00'],['60.01',5,'3.00','57.01']])('uses the exact S/60 tier boundary for %s',(price,percent,fee,net)=>{
  expect(publicationPricing({modality:'Venta',price}).owner).toMatchObject({service_fee_percent:percent,service_fee:fee,owner_net:net});
});
