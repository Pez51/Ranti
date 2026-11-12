import { createHash } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { money } from '../publications/risk.policy.js';
import { publicationPricing } from '../publications/publication-pricing.js';

export const financeError=message=>new AppError({status:409,code:'FINANCE_UNAVAILABLE',message,details:null});
export const formatCents=value=>{const cents=BigInt(value);return `${cents<0n?'-':''}${(cents<0n?-cents:cents)/100n}.${String((cents<0n?-cents:cents)%100n).padStart(2,'0')}`;};
export function canRetryFinancePayment(operation, payment, deadlinePassed) {
 return operation.status === 'Pendiente de pago/garantía' && !deadlinePassed &&
  payment?.mode === 'simulated' && payment.status === 'failed';
}

export function chargebackBalance(total, refunded, guaranteeRefunded) {
 const balance = BigInt(total) - BigInt(refunded) - BigInt(guaranteeRefunded);
 return balance > 0n ? balance : 0n;
}
const tariffSchema=z.object({version:z.string().min(1).max(100),currency:z.literal('PEN'),environment:z.enum(['simulated','sandbox']),confirmed:z.literal(true),
 percentage_ppm:z.number().int().min(0).max(999999),fixed_cents:z.number().int().min(0).max(9999999999),minimum_fee_cents:z.number().int().min(0).max(9999999999),
 tax_ppm:z.number().int().min(0).max(1000000),tax_treatment:z.enum(['included','exclusive']),rounding:z.enum(['ceil','floor','half_up']),
 min_total_cents:z.number().int().min(0),max_total_cents:z.number().int().min(1).max(9999999999),fee_base:z.literal('full_total'),
 guarantee_policy:z.enum(['not_collected','charge_refundable'])}).strict();
export const simulatedTariff={version:'simulation-only-zero-processor-v1',currency:'PEN',environment:'simulated',confirmed:true,percentage_ppm:0,fixed_cents:0,minimum_fee_cents:0,tax_ppm:0,tax_treatment:'included',rounding:'half_up',min_total_cents:0,max_total_cents:9999999999,fee_base:'full_total',guarantee_policy:'not_collected'};
export function validateTariff(input){
 const result=tariffSchema.safeParse(input);
 if(!result.success)throw financeError('La tarifa del medio de pago no está configurada o no es compatible.');
 const t=result.data,mult=t.tax_treatment==='exclusive'?1000000n+BigInt(t.tax_ppm):1000000n;
 if(BigInt(t.percentage_ppm)*mult>=1000000000000n||t.min_total_cents>t.max_total_cents)throw financeError('Tarifa incompatible con el modelo económico.');
 return t;
}
export function configuredMethods(){
 let extra;try{extra=JSON.parse(process.env.RANTI_PROCESSOR_TARIFFS||'{}');}catch{throw financeError('Configuración de tarifas inválida.');}
 if(!extra||Array.isArray(extra)||typeof extra!=='object')throw financeError('Configuración de tarifas inválida.');
 return {simulated:simulatedTariff,...Object.fromEntries(Object.entries(extra).filter(([key])=>key!=='simulated').map(([key,value])=>[key,validateTariff(value)]))};
}
export function processorFee(total,input){
 const t=validateTariff(input),scale=1000000n;
 let numerator=BigInt(total)*BigInt(t.percentage_ppm)+BigInt(t.fixed_cents)*scale;
 numerator=numerator>BigInt(t.minimum_fee_cents)*scale?numerator:BigInt(t.minimum_fee_cents)*scale;
 const multiplier=t.tax_treatment==='exclusive'?scale+BigInt(t.tax_ppm):scale;
 const n=numerator*multiplier,d=scale*scale;
 return t.rounding==='ceil'?(n+d-1n)/d:t.rounding==='half_up'?(n+d/2n)/d:n/d;
}
export function economicBasis(op){
 const s=op.accepted_at?op.contract_snapshot:{agreed_price:op.offered_price??op.requested_price,guarantee_amount:op.requested_guarantee_amount,guarantee_required:op.guarantee_required,rental_unit:op.requested_rental_unit,start_date:op.start_date,end_date:op.end_date};
 if(!s)throw financeError('Faltan condiciones económicas.');
 const unitMs={hour:3600000,day:86400000,week:604800000,month:2592000000};
 const units=op.modality==='Alquiler'?Math.ceil((new Date(op.end_date).getTime()-new Date(op.start_date).getTime())/unitMs[s.rental_unit||'day']):1;
 if(!Number.isSafeInteger(units)||units<1)throw financeError('Período de alquiler inválido.');
 const calculated=publicationPricing({modality:op.modality,price:s.agreed_price,guarantee_amount:s.guarantee_amount,rental_unit:s.rental_unit});
 const pricing=s.pricing?{owner:s.pricing,platform:{net_service_income:formatCents((money(s.pricing.service_fee).cents*100n+59n)/118n)}}:calculated;
 if(money(pricing.owner.gross_amount).cents!==money(s.agreed_price).cents||money(pricing.owner.owner_net).cents+money(pricing.owner.service_fee).cents!==money(pricing.owner.gross_amount).cents)throw financeError('El desglose aceptado no coincide con el contrato.');
 // Preserve the existing per-unit policy and half-up rounding, not a second fee.
 const gross=money(pricing.owner.gross_amount).cents*BigInt(units),income=money(pricing.owner.service_fee).cents*BigInt(units),owner=gross-income;
 const netIncome=money(pricing.platform.net_service_income).cents*BigInt(units);
 const guarantee=money(s.guarantee_amount||0).cents,guaranteeRequired=op.modality!=='Venta'&&s.guarantee_required===true;
 const terms={price:String(s.agreed_price),modality:op.modality,start:op.start_date?new Date(op.start_date).toISOString():null,end:op.end_date?new Date(op.end_date).toISOString():null,unit:s.rental_unit||null,guarantee:formatCents(guarantee),owner:op.oferente_id,requester:op.demandante_id};
 if(guaranteeRequired)terms.guarantee_required=true;
 return {gross,income,owner,netIncome,guarantee,guaranteeRequired,units,policy:pricing.owner.policy_version,terms_key:createHash('sha256').update(JSON.stringify(terms)).digest('hex')};
}
export function calculateFinance(op,input){
 const t=validateTariff(input),b=economicBasis(op),guarantee=b.guaranteeRequired&&t.guarantee_policy==='charge_refundable'?b.guarantee:0n;
 const target=b.owner+b.income+guarantee,max=BigInt(t.max_total_cents);
 let low=target,high=max;
 if(low>max||max-processorFee(max,t)<target)throw financeError('El total excede los límites de este medio de pago.');
 // Minimal exact cent amount, including fee on the fee and provider rounding.
 while(low<high){const mid=(low+high)/2n;if(mid-processorFee(mid,t)>=target)high=mid;else low=mid+1n;}
 if(low<BigInt(t.min_total_cents))throw financeError('El importe no alcanza el mínimo de este medio. Elige otro medio; no se incrementará artificialmente el precio.');
 const total=low,cost=processorFee(total,t),service=total-b.owner-guarantee;
 return {terms_key:b.terms_key,policy_version:b.policy,unit_count:b.units,currency:'PEN',gross_cents:String(b.gross),owner_cents:String(b.owner),ranti_expected_cents:String(b.income),ranti_net_tax_cents:String(b.netIncome),ranti_included_tax_cents:String(b.income-b.netIncome),processor_expected_cents:String(cost),service_cents:String(service),total_cents:String(total),guarantee_declared_cents:String(b.guarantee),guarantee_required:b.guaranteeRequired,guarantee_charged_cents:String(guarantee),tariff_version:t.version};
}
export function buyerQuote(e){return {currency:e.currency,price:formatCents(e.owner_cents),service_charge:formatCents(e.service_cents),commission:formatCents(e.ranti_expected_cents),processor_cost:formatCents(e.processor_expected_cents),guarantee_declared:formatCents(e.guarantee_declared_cents),guarantee_required:e.guarantee_required===true,guarantee_charged:formatCents(e.guarantee_charged_cents),total:formatCents(e.total_cents),unit_count:e.unit_count,guarantee_note:BigInt(e.guarantee_charged_cents)>0n?'Garantía obligatoria reembolsable, separada del ingreso.':e.guarantee_required?'Garantía obligatoria acordada: no se cobra ni se custodia en este modo.':'Garantía referencial ante daños: no se exige por adelantado ni se cobra automáticamente.'};}
export function ownerQuote(e){return {currency:e.currency,gross_amount:formatCents(e.gross_cents),deduction:formatCents(BigInt(e.gross_cents)-BigInt(e.owner_cents)),net_amount:formatCents(e.owner_cents),explanation:'Se conserva la deducción Ranti vigente del precio acordado. El costo del procesamiento no añade otra deducción al oferente.'};}
