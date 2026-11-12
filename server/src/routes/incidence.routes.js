import express from 'express';
import pool from '../config/database.js';
import { AppError } from '../shared/errors/app-error.js';
import { requireAuth,requireVerifiedAccount,requireRole } from '../middlewares/auth.middleware.js';
import * as service from '../modules/operations/incidence.service.js';
const participant=express.Router(),admin=express.Router();
const handler=fn=>async(req,res,next)=>{try{res.set('Cache-Control','private, no-store').json(await fn(req));}catch(e){next(e instanceof AppError?e:new AppError({status:500,code:'INCIDENCE_ERROR',message:'No se pudo completar la actuación del caso. Actualiza antes de reintentar.'}));}};
const upload=isAdmin=>[express.raw({type:['image/jpeg','image/png','image/webp','application/pdf'],limit:'5mb'}),handler(req=>{
 let name;try{name=decodeURIComponent(req.get('X-File-Name')||'Evidencia');}catch{throw new AppError({status:400,message:'Nombre de archivo inválido.'});}
 return service.uploadIncidenceEvidence(pool,req.params.id,req.user.id,req.body,req.get('Content-Type'),name,isAdmin);
})];
const download=isAdmin=>async(req,res,next)=>{try{
 const file=await service.downloadIncidenceEvidence(pool,req.params.id,req.params.fileId,req.user.id,isAdmin);
 res.set({'Cache-Control':'private, no-store','Content-Type':file.mime,'X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="evidencia"; filename*=UTF-8''${encodeURIComponent(file.name)}`}).send(file.bytes);
}catch(e){next(e instanceof AppError?e:new AppError({status:500,message:'No se pudo descargar la evidencia.'}));}};
participant.use(['/operations/:id/incidences','/incidences'],requireAuth,requireVerifiedAccount);
participant.get('/operations/:id/incidences',handler(req=>service.listOperationIncidences(pool,req.params.id,req.user.id)));
participant.post('/operations/:id/incidences',handler(req=>service.openIncidence(pool,req.params.id,req.user.id,req.body)));
participant.get('/incidences/:id',handler(req=>service.readIncidence(pool,req.params.id,req.user.id,false,req.query.before)));
participant.post('/incidences/:id/replies',handler(req=>service.replyIncidence(pool,req.params.id,req.user.id,req.body)));
participant.post('/incidences/:id/evidence',...upload(false));
participant.get('/incidences/:id/evidence/:fileId',download(false));
admin.use(requireAuth,requireVerifiedAccount,requireRole('Administrador'));
admin.get('/',handler(req=>service.listAdminIncidences(pool,req.user.id,req.query.offset===undefined?0:Number(req.query.offset))));
admin.get('/:id',handler(req=>service.readIncidence(pool,req.params.id,req.user.id,true,req.query.before)));
admin.post('/:id/actions',handler(req=>service.decideIncidence(pool,req.params.id,req.user.id,req.body)));
admin.post('/:id/replies',handler(req=>service.replyIncidence(pool,req.params.id,req.user.id,req.body,true)));
admin.post('/:id/evidence',...upload(true));
admin.get('/:id/evidence/:fileId',download(true));
admin.get('/:id/return-evidence/:fileId',async(req,res)=>{
 const file=await service.downloadCaseReturnEvidence(pool,req.params.id,req.params.fileId,req.user.id);
 res.set({'Cache-Control':'private, no-store','Content-Type':file.mime,'X-Content-Type-Options':'nosniff',
  'Content-Disposition':`attachment; filename="evidencia"; filename*=UTF-8''${encodeURIComponent(file.name)}`}).send(file.bytes);
});
export {admin as adminIncidenceRoutes};
export default participant;
