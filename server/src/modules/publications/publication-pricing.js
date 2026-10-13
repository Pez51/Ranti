import { money } from './risk.policy.js';
// Pilot policy: total fee 10% below S/60, 5% from S/60; loans are free,
// with platform-side tax included in that fee, never an extra owner deduction.
const amount=cents=>`${cents/100n}.${String(cents%100n).padStart(2,'0')}`;
export function publicationPricing(publication){
  const loan=publication.modality==='Préstamo';
  const gross=loan?0n:money(publication.price).cents;
  const percent=loan?0:gross<6000n?10:5;
  const fee=(gross*BigInt(percent)+50n)/100n;
  const platformNet=(fee*100n+59n)/118n;
  return {
    owner:{policy_version:'pilot-fee-v3-tiered-inclusive-igv',simulated:true,currency:'PEN',service_fee_percent:percent,
      modality:publication.modality,unit:publication.modality==='Alquiler'?({hour:'hora',day:'día',week:'semana',month:'mes (30 días)'}[publication.rental_unit||'day']):'operación',
      gross_amount:amount(gross),service_fee:amount(fee),owner_net:amount(gross-fee),
      guarantee_amount:money(loan||publication.modality==='Alquiler'?publication.guarantee_amount??0:0).text},
    platform:{net_service_income:amount(platformNet),included_service_tax:amount(fee-platformNet)},
  };
}
