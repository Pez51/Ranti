import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().url().refine(
    (url) => /^postgres(?:ql)?:\/\//.test(url),
    'Debe ser una URL de PostgreSQL.',
  ),
  JWT_SECRET: z.string().min(1),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  PAYMENT_PROVIDER: z.enum(['simulated', 'culqi', 'niubiz']).default('simulated'),
  IDENTITY_PROVIDER: z.enum(['simulated']).default('simulated'),
  IDENTITY_SIMULATOR_EXPOSE_CODE: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  OPERATION_REQUEST_TTL_HOURS: z.union([
    z.number(), z.string().regex(/^[0-9]+$/).transform(Number),
  ]).pipe(z.number().int().min(1).max(168)).default(48),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== 'test' && value.JWT_SECRET.length < 32) {
    context.addIssue({
      code: 'custom',
      path: ['JWT_SECRET'],
      message: 'Debe tener al menos 32 caracteres fuera de pruebas.',
    });
  }
});

export function loadEnv(source = process.env) {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Configuración inválida: ${fields}`);
  }
  return Object.freeze(parsed.data);
}

export const env = loadEnv();
