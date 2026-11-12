import { afterEach,it,expect,vi } from 'vitest';
import { reviewEligibility,reviewPublicationDays,reviewSchema } from '../src/modules/operations/review.policy.js';
afterEach(()=>vi.unstubAllEnvs());
it('requires a closed, completed operation with applicable return and payment, without pending incidents',()=>{
 const op={status:'Cerrada',accepted_at:new Date(),closed_at:new Date(),modality:'Venta'},h={owner_delivered_at:new Date(),requester_received_at:new Date()};
 expect(reviewEligibility(op,h,0,true)).toBe(true);expect(reviewEligibility(op,h,1,true)).toBe(false);expect(reviewEligibility(op,h,0,false)).toBe(false);
 expect(reviewEligibility({...op,modality:'Alquiler'},h,0,true)).toBe(false);
 expect(reviewEligibility({...op,modality:'Préstamo'},{...h,owner_returned_at:new Date(),requester_returned_at:new Date()},0,false)).toBe(true);
 for(const status of ['Pendiente','Rechazada','Cancelada','Expirada','Entregada/Activa'])expect(reviewEligibility({...op,status},h,0,true)).toBe(false);
});
it('validates stars and configurable publication deadline without accepting client-selected participants',()=>{
 expect(reviewPublicationDays()).toBe(7);vi.stubEnv('REVIEW_PUBLICATION_DAYS','2');expect(reviewPublicationDays()).toBe(2);
 vi.stubEnv('REVIEW_PUBLICATION_DAYS','0');expect(()=>reviewPublicationDays()).toThrow();
 for(const rating of [0,6,1.5,'5'])expect(reviewSchema.safeParse({person_rating:rating}).success).toBe(false);
 expect(reviewSchema.safeParse({person_rating:5,subject_id:'someone'}).success).toBe(false);
 expect(reviewSchema.safeParse({person_rating:5,product_comment:'sin estrellas'}).success).toBe(false);
});
