import { z } from 'zod';

// bcrypt consumes at most 72 UTF-8 bytes; registration and login must reject
// longer inputs before hashing/comparing so distinct passwords cannot alias.
export const passwordInput = z.string().min(8).max(72)
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72);
