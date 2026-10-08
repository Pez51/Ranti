import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string()
    .email('Debe ser un correo electrónico válido.')
    .refine((email) => email.endsWith('@estudiante.ucsm.edu.pe') || email.endsWith('@ucsm.edu.pe'), {
      message: 'Debe ser un correo institucional válido de la UCSM.'
    }),
  password: z.string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres.')
    .max(50, 'La contraseña es demasiado larga.'),
  role: z.enum(['Estudiante', 'Docente', 'Egresado', 'Administrador']).optional(),
  academic_condition: z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email('Formato de correo inválido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.')
});

export const confirmSchema = z.object({
  email: z.string().email('Formato de correo inválido.'),
  code: z.string().length(6, 'El código OTP debe tener exactamente 6 dígitos.')
});