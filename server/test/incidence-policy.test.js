import { afterEach,it,expect,vi } from 'vitest';
import { reportPolicy,reportWindowDays,adminIncidenceSchema } from '../src/modules/operations/incidence.policy.js';
afterEach(()=>vi.unstubAllEnvs());
it('uses the close timestamp, allows the exact deadline and rejects later reports',()=>{
 const op={modality:'Venta',status:'Cerrada',closed_at:'2026-10-01T12:00:00Z'};
 expect(reportPolicy(op,null,new Date('2026-10-08T12:00:00Z')).allowed).toBe(true);
 expect(reportPolicy(op,null,new Date('2026-10-08T12:00:00.001Z')).allowed).toBe(false);
 expect(reportPolicy({...op,closed_at:null},null).allowed).toBe(false);
});
it('fails closed for invalid configuration and rejects arbitrary resolutions',()=>{
 vi.stubEnv('INCIDENCE_REPORT_WINDOW_DAYS','no');expect(()=>reportWindowDays()).toThrow();
 expect(adminIncidenceSchema.safeParse({action:'resolve',revision:1,body:'Resolución administrativa',decision:'refund_everything'}).success).toBe(false);
});
it('adapts reasons to modality and stage',()=>{
 const sale={modality:'Venta',status:'Aceptada',accepted_at:new Date()};
 expect(reportPolicy(sale).reasons.some(r=>r.id==='return')).toBe(false);
 expect(reportPolicy({...sale,modality:'Alquiler',status:'Entregada/Activa'}).reasons.some(r=>r.id==='return')).toBe(true);
 expect(reportPolicy({...sale,status:'Rechazada'}).allowed).toBe(false);
});
