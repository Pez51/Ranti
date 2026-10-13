import pool from '../config/database.js';
import { uploadProvenance,readProvenance } from '../modules/publications/provenance-files.js';
export async function upload(req,res,next){
  try{res.status(201).json(await uploadProvenance(pool,req.user.id,req.body,req.get('content-type')));}catch(error){next(error);}
}
export async function download(req,res,next){
  try{
    const {bytes,mime}=await readProvenance(pool,req.user.id,req.params.fileId);
    const extension={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[mime];
    res.set({'Content-Type':mime,'Content-Disposition':`attachment; filename="boleta.${extension}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(bytes);
  }catch(error){if(error.code==='ENOENT')return res.sendStatus(404);next(error);}
}
