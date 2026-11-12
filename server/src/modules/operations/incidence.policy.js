import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { retentionInput } from './return-settlement.js';
export const incidenceError=(status,message)=>new AppError({status,code:'INCIDENCE_ERROR',message});
export const pendingIncidence=status=>!['Resuelta','Desestimada'].includes(status);
export function reportWindowDays(){
 const days=Number(process.env.INCIDENCE_REPORT_WINDOW_DAYS??7);
 if(!Number.isInteger(days)||days<1||days>365)throw incidenceError(503,'El plazo de reportes no está configurado correctamente.');
 return days;
}
export function incidenceStage(op,h={}){
 if(op.status==='Cerrada')return 'closed';
 if(h?.owner_delivered_at||h?.requester_received_at||op.status==='Entregada/Activa')return 'delivered';
 return op.accepted_at?'accepted':'request';
}
export function reportPolicy(op,h,now=new Date(),canReportMissing=false){
 const stage=incidenceStage(op,h),days=reportWindowDays();
 const deadline=op.closed_at?new Date(new Date(op.closed_at).getTime()+days*86400000):null;
 const ordinaryAllowed=['Venta','Alquiler','Préstamo'].includes(op.modality)&&!['Rechazada','Expirada','Cancelada','Cancelación en reversión'].includes(op.status)
  &&(stage!=='closed'||Boolean(deadline&&now<=deadline));
 const reasons=op.status==='Cancelada'?[]:[{id:'communication',label:'Problemas de comunicación'},{id:'other',label:'Otro problema'}];
 if(stage!=='request'&&op.status!=='Cancelada')reasons.unshift({id:'meeting',label:'Problemas con el encuentro o la entrega'},{id:'payment',label:'Problemas con el pago'});
 if(['delivered','closed'].includes(stage))reasons.unshift({id:'not_as_described',label:'El artículo no coincide con lo acordado'},{id:'damage',label:'Daños o mal funcionamiento'});
 if(op.modality!=='Venta'&&['delivered','closed'].includes(stage))reasons.unshift({id:'return',label:'Problemas con la devolución'},{id:'late_return',label:'Devolución fuera de plazo'},{id:'guarantee',label:'Desacuerdo sobre la garantía'});
 if(op.contract_snapshot?.workflow_payment&&op.status==='Lista para entrega'&&!h?.owner_delivered_at&&!h?.requester_received_at){
  reasons.unshift({id:'paid_cancellation',label:'Solicitar cancelación del trato pagado'});
  if(h?.agreed_by&&h.meeting_at<=now)reasons.unshift({id:'delivery_absence',label:'Inasistencia al encuentro'},
    {id:'delivery_not_validated',label:'No se pudo validar la entrega presencial'});
 }
 const choices=ordinaryAllowed?reasons:[];
 if(canReportMissing)choices.unshift({id:'money_not_received',label:'No recibí el abono, la devolución o la garantía'});
 return {allowed:ordinaryAllowed||canReportMissing,stage,reasons:choices,post_close_days:days,report_deadline:deadline?.toISOString()??null};
}
export const reportSchema=z.object({reason:z.string().min(1).max(100),description:z.string().trim().min(10).max(3000),
 occurred_at:z.iso.datetime({offset:true}).optional(),movement_reference:z.string().trim().min(1).max(150).optional()}).strict().refine(
 data=>(!['delivery_absence','delivery_not_validated','money_not_received'].includes(data.reason)||data.occurred_at)&&
 (data.reason==='money_not_received')===(data.movement_reference!==undefined),
 {message:'Registra la fecha y el movimiento que corresponden al motivo.'});
export const replySchema=z.object({revision:z.number().int().min(1),body:z.string().trim().min(1).max(3000)}).strict();
export const adminIncidenceSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('review'),revision:z.number().int().min(1),body:z.string().trim().min(1).max(3000)}).strict(),
 z.object({action:z.literal('request_information'),revision:z.number().int().min(1),body:z.string().trim().min(1).max(3000),target_id:z.uuid()}).strict(),
 z.object({action:z.literal('resolve'),revision:z.number().int().min(1),body:z.string().trim().min(10).max(3000),
  decision:z.enum(['record_only','continue_operation','cancel_operation','settle_guarantee','refund_payment']),
  retention_cents:z.string().regex(retentionInput).optional(),
  guarantee_outcome:z.enum(['proceeds','dismissed']).optional(),
  refund_cents:z.string().regex(retentionInput).optional()}).strict().refine(
  data=>(data.decision==='settle_guarantee')===(data.retention_cents!==undefined)&&
    (data.decision==='refund_payment')===(data.refund_cents!==undefined)&&
    (!data.guarantee_outcome||data.decision==='settle_guarantee')&&
    (data.guarantee_outcome!=='dismissed'||BigInt(data.retention_cents??'0')===0n),
  {message:'Indica el importe que corresponde a la decisión.'}),
]);
