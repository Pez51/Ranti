import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';
import { projectOperation } from './operation-request.service.js';
import { simulationQuote } from './payment-simulation.policy.js';
import { appendConversationEvent } from './conversation-events.js';
export async function simulatePayment(db,id,actor,input){
  if(!z.uuid().safeParse(id).success||!z.object({confirm_simulation:z.literal(true)}).strict().safeParse(input).success)throw new AppError({status:400,code:'INVALID_INPUT',message:'Confirma que es una simulación sin cobro real.'});
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    const reference=(await c.query('SELECT publication_id FROM operations WHERE id=$1 AND demandante_id=$2',[id,actor])).rows[0];
    if(!reference)throw new AppError({status:404,code:'OPERATION_NOT_FOUND',message:'Operación no encontrada.'});
    await c.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE',[reference.publication_id]);
    let op=(await c.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE',[id])).rows[0];
    const users=(await c.query('SELECT * FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR NO KEY UPDATE',[[op.demandante_id,op.oferente_id]])).rows;users.forEach(requireCurrentUser);
    const h=(await c.query('SELECT * FROM operation_handoffs WHERE operation_id=$1',[id])).rows[0];
    if(!h?.agreed_by||h.change_requested||!['Pendiente de pago/garantía','Lista para entrega'].includes(op.status))throw new AppError({status:409,code:'PAYMENT_SIMULATION_INVALID',message:'Primero ambos deben acordar lugar y horario. El calendario puede omitirse, el acuerdo no.'});
    if((await c.query('SELECT id FROM transactions WHERE operation_id=$1 LIMIT 1',[id])).rowCount)throw new AppError({status:409,code:'PAYMENT_SIMULATION_INVALID',message:'Una operación económica no puede simularse por este flujo.'});
    const quote=simulationQuote(op);
    const existing=(await c.query('SELECT operation_id FROM operation_payment_simulations WHERE operation_id=$1',[id])).rowCount;
    if(!existing){
      await c.query('INSERT INTO operation_payment_simulations(operation_id,requester_id,amount,unit_count)VALUES($1,$2,$3,$4)',[id,actor,quote.amount,quote.unit_count]);
      op=(await c.query("UPDATE operations SET status='Lista para entrega',updated_at=clock_timestamp() WHERE id=$1 RETURNING *",[id])).rows[0];
      await appendAudit(c,{actorId:actor,action:'payment.simulated',entityType:'operation',entityId:id,newValues:{simulated:true,amount:quote.amount,unit_count:quote.unit_count}});
      await appendConversationEvent(c,op,actor,{type:'payment.simulated',key:'payment.simulated',body:'Completó el pago simulado. No se cobró dinero ni se retuvo garantía. Ya pueden realizar la entrega acordada y confirmar la recepción.'});
    }
    const result={operation:await projectOperation(c,op,actor)};await c.query('COMMIT');return result;
  }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
