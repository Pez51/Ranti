import { z } from 'zod';
import { publicationImageReference } from './publication-photo.js';
import { provenanceReference } from './provenance-files.js';

export const createPublicationSchema = z.object({
  title: z.string().max(255),
  description: z.string().max(1000,'La descripción debe tener como máximo 1000 caracteres.'),
  category: z.string().max(100),
  category_other:z.string().max(100).nullable().optional(),
  condition: z.string().max(50),
  condition_rating:z.number().int().min(1).max(5).nullable().optional(),
  modality: z.enum(['Venta', 'Alquiler', 'Préstamo']),
  rental_unit:z.enum(['hour','day','week','month']).optional(),
  price: z.union([z.number().nonnegative().max(99999999.99), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).nullable().optional(),
  guarantee_amount: z.union([z.number().nonnegative().max(99999999.99), z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/)]).nullable().optional(),
  available_from: z.string().max(40).nullable().optional(),
  available_until: z.string().max(40).nullable().optional(),
  provenance_evidence_ref:z.string().max(2048).refine(provenanceReference).nullable().optional(),
  images: z.array(z.string().max(2048).refine(publicationImageReference)).max(7).optional()
}).strict();
