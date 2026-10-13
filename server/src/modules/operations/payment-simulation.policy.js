import { AppError } from '../../shared/errors/app-error.js';
import { money } from '../publications/risk.policy.js';
export function simulationQuote(operation){
  const snapshot=operation.contract_snapshot;
  const unitMs={hour:3600000,day:86400000,week:7*86400000,month:30*86400000};
  const units=operation.modality==='Alquiler'?Math.ceil((new Date(operation.end_date)-new Date(operation.start_date))/(unitMs[snapshot.rental_unit||'day'])):1;
  if(!Number.isSafeInteger(units)||units<1)throw new AppError({status:409,code:'PAYMENT_SIMULATION_INVALID',message:'El período acordado no permite calcular la simulación.'});
  const cents=money(snapshot.agreed_price).cents*BigInt(units);
  if(cents>9999999999n)throw new AppError({status:409,code:'PAYMENT_SIMULATION_INVALID',message:'El importe supera el límite del piloto.'});
  return {simulated:true,currency:'PEN',amount:`${cents/100n}.${String(cents%100n).padStart(2,'0')}`,unit_count:units,guarantee_held:false};
}
