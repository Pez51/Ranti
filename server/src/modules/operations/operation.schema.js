import { z } from 'zod';

export const createOperationSchema = z.object({
  publication_id: z.union([z.string(), z.number()]), // Soporta UUID o ID numérico
  start_date: z.string().datetime('Formato de fecha inválido').optional(),
  end_date: z.string().datetime('Formato de fecha inválido').optional()
});

export const confirmDeliverySchema = z.object({
  otp_code: z.string().length(6, 'El código OTP debe tener 6 dígitos.')
});