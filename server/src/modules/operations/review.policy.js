import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
export const reviewError=(status,message)=>new AppError({status,code:'REVIEW_ERROR',message});
export function reviewPublicationDays(){
 const days=Number(process.env.REVIEW_PUBLICATION_DAYS??7);
 if(!Number.isInteger(days)||days<1||days>365)throw reviewError(503,'El plazo de publicación de evaluaciones no está configurado correctamente.');
 return days;
}
export function reviewEligibility(op,h,pending,paid,closedBySilence=false){
 return Boolean(op.status==='Cerrada'&&op.accepted_at&&op.closed_at&&h?.owner_delivered_at&&h?.requester_received_at
  &&(op.modality==='Venta'||((h.owner_returned_at||closedBySilence)&&h.requester_returned_at))&&!pending&&(op.modality==='Préstamo'||paid));
}
export const reviewSchema=z.object({person_rating:z.number().int().min(1).max(5),person_comment:z.string().trim().max(1000).default(''),
 product_rating:z.number().int().min(1).max(5).optional(),product_comment:z.string().trim().max(1000).optional()}).strict()
 .refine(value=>!value.product_comment||value.product_rating!==undefined);
