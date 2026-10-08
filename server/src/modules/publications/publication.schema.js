import { z } from 'zod';

export const createPublicationSchema = z.object({
  title: z.string().min(5, 'El título debe tener al menos 5 caracteres.'),
  description: z.string().min(10, 'La descripción es muy corta.'),
  category: z.string(),
  condition: z.enum(['Nuevo', 'Como nuevo', 'Buen estado', 'Aceptable']),
  modality: z.enum(['Venta', 'Alquiler', 'Préstamo']),
  price: z.number().nonnegative('El precio no puede ser negativo.').optional(),
  guarantee_amount: z.number().nonnegative().optional(),
  images: z.array(z.string().url()).optional()
});