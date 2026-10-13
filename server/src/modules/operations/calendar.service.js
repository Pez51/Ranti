import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { appendConversationEvent } from './conversation-events.js';
const halfHour=1800000,week=7*86400000;
function windowEnd(op){return new Date(Math.min(op.accepted_at.getTime()+week,op.modality!=='Venta'&&op.start_date?op.start_date.getTime():Infinity));}
const defaultPlace='Dentro de la UCSM — lugar por precisar';
const fail=(status,message)=>new AppError({status,code:'CALENDAR_ERROR',message});
const schema=z.object({revision:z.number().int().min(0),skipped:z.boolean(),slots:z.array(z.iso.datetime({offset:true})).max(336),location_preference:z.string().trim().min(3).max(200)}).strict();
async function participant(db,id,actor,lock=false){
  if(!z.uuid().safeParse(id).success)throw fail(400,'Identificador inválido.');
  const op=(await db.query(`SELECT * FROM operations WHERE id=$1 AND(oferente_id=$2 OR demandante_id=$2)${lock?' FOR UPDATE':''}`,[id,actor])).rows[0];
  if(!op)throw fail(404,'Operación no encontrada.');
  requireCurrentUser((await db.query('SELECT * FROM users WHERE id=$1',[actor])).rows[0]);
  if(!op.accepted_at)throw fail(409,'El calendario se habilita después de aceptar el trato.');
  return op;
}
async function view(db,op,actor){
  const now=(await db.query('SELECT clock_timestamp() AS now')).rows[0].now;
  const end=windowEnd(op);
  const rows=(await db.query('SELECT * FROM operation_calendar_availability WHERE operation_id=$1',[op.id])).rows;
  const mine=rows.find(row=>row.user_id===actor),other=rows.find(row=>row.user_id!==actor);
  const theirs=new Set((other?.slots||[]).map(date=>date.toISOString()));
  const common=(mine?.skipped||other?.skipped?[]:(mine?.slots||[]).filter(date=>theirs.has(date.toISOString())&&date>now&&date.getTime()+halfHour<=end.getTime())).sort((a,b)=>a-b);
  return {operation_id:op.id,accepted_at:op.accepted_at,window_end:end,delivery_before:op.modality!=='Venta'?op.start_date:null,server_now:now,slot_minutes:30,
    editable:op.status==='Aceptada'&&now<end,revision:mine?.revision??0,slots:mine?.slots??[],skipped:mine?.skipped??false,
    location_preference:mine?.location_preference??defaultPlace,other_submitted:Boolean(other),other_skipped:other?.skipped??false,
    recommendations:common.map(start=>({start,end:new Date(start.getTime()+halfHour)})),
    location_suggestion:mine?.location_preference===other?.location_preference?mine?.location_preference:defaultPlace};
}
export async function readCalendar(db,id,actor){return view(db,await participant(db,id,actor),actor);}
export async function saveCalendar(db,id,actor,input){
  const parsed=schema.safeParse(input);if(!parsed.success)throw fail(400,'Revisa los días, horarios y lugar preferido.');
  const c=await db.connect();
  try{
    await c.query('BEGIN');const op=await participant(c,id,actor,true),data=parsed.data;
    const now=(await c.query('SELECT clock_timestamp() AS now')).rows[0].now,end=windowEnd(op);
    if(op.status!=='Aceptada')throw fail(409,'Ya se acordó el encuentro o cambió la operación. Consulta la coordinación actual.');
    if(!data.skipped&&now>=end)throw fail(409,'Terminó el plazo del calendario. Coordina por chat; si el período solicitado ya empezó, deben revisar las fechas del pedido.');
    if(data.skipped&&data.slots.length)throw fail(400,'Al omitir el calendario no se envían horarios.');
    const slots=[...new Set(data.slots.map(date=>new Date(date).toISOString()))].sort();
    if(slots.some(date=>{const start=new Date(date);return start<op.accepted_at||start<=now||start.getTime()%halfHour!==0||start.getTime()+halfHour>end.getTime();}))throw fail(400,'Marca franjas futuras de 30 minutos dentro de los siete días desde la aceptación y anteriores al inicio del alquiler o préstamo.');
    const previous=(await c.query('SELECT revision FROM operation_calendar_availability WHERE operation_id=$1 AND user_id=$2',[id,actor])).rows[0];
    if((previous?.revision??0)!==data.revision)throw fail(409,'Tu calendario cambió en otra ventana. Actualiza antes de guardar.');
    await c.query(`INSERT INTO operation_calendar_availability(operation_id,user_id,slots,skipped,location_preference)VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(operation_id,user_id)DO UPDATE SET slots=EXCLUDED.slots,skipped=EXCLUDED.skipped,location_preference=EXCLUDED.location_preference,revision=operation_calendar_availability.revision+1,updated_at=clock_timestamp()`,[id,actor,slots,data.skipped,data.location_preference]);
    await appendAudit(c,{actorId:actor,action:data.skipped?'calendar.skipped':'calendar.saved',entityType:'operation',entityId:id,newValues:{slot_count:slots.length,revision:data.revision+1}});
    await appendConversationEvent(c,op,actor,{type:data.skipped?'calendar.skipped':'calendar.saved',key:`calendar:${actor}:${data.revision+1}`,body:data.skipped?'Omitió el calendario. Pueden acordar el encuentro por chat.':`Guardó sus horarios disponibles (${slots.length} franjas). Revisen las coincidencias para proponer el encuentro.`});
    const result=await view(c,op,actor);await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
