import { z } from 'zod';
import { isUcsmInstitutionalEmail } from './identity-provider.js';
import { passwordInput } from './password-input.js';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().refine(isUcsmInstitutionalEmail),
  password: passwordInput,
  acceptTerms: z.literal(true),
  termsVersion: z.string().trim().min(1).max(100),
});

export const loginSchema = z.object({
  email: z.string().email('Formato de correo inválido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.')
});

export const confirmSchema = z.object({
  challengeId: z.uuid(),
  code: z.string().regex(/^\d{6}$/, 'El código OTP debe tener exactamente 6 dígitos.')
});
