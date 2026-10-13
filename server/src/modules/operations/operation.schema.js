import { z } from 'zod';
import { parseOperationRequest } from './operation.policy.js';

export const createOperationSchema=z.unknown().superRefine((value,context)=>{
  try{parseOperationRequest(value);}catch{context.addIssue({code:'custom',message:'Confirma el precio, la garantía, la versión y las fechas de la publicación.'});}
});

export const confirmDeliverySchema = z.object({
  otp_code: z.string().length(6, 'El código OTP debe tener 6 dígitos.')
});
