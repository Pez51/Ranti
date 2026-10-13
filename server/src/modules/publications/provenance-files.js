import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppError } from '../../shared/errors/app-error.js';
import { photoMime } from '../users/photo-storage.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { appendAudit } from '../audit/audit.repository.js';

const directory=path.resolve(process.env.RANTI_PROVENANCE_DIR||fileURLToPath(new URL('../../../uploads/private-provenance/',import.meta.url)));
export const provenancePattern=/^\/api\/publications\/provenance\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const url=id=>`/api/publications/provenance/${id}`;
const invalid=()=>new AppError({status:400,code:'INVALID_PROVENANCE_FILE',message:'Sube una foto JPEG, PNG o WebP de hasta 2 MB, o un PDF de hasta 5 MB.'});
export function provenanceReference(value){
  if(typeof value!=='string') return false;
  if(provenancePattern.test(value)) return true;
  try{const parsed=new URL(value);return parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&!/[\s\\]/.test(value);}catch{return false;}
}
export function provenanceMime(bytes){
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>5*1024*1024) return null;
  return photoMime(bytes)||(bytes.subarray(0,5).toString('ascii')==='%PDF-'&&bytes.subarray(-1024).includes(Buffer.from('%%EOF'))?'application/pdf':null);
}
export const provenanceStorage={
  async save(id,bytes){await mkdir(directory,{recursive:true});await writeFile(path.join(directory,id),bytes,{flag:'wx'});},
  async read(id){return readFile(path.join(directory,id));},
  async remove(id){await unlink(path.join(directory,id)).catch(e=>{if(e.code!=='ENOENT')throw e;});},
};
export async function requireOwnedProvenance(client,reference,ownerId){
  const id=provenancePattern.exec(reference||'')?.[1];
  if(id && !(await client.query('SELECT id FROM provenance_files WHERE id=$1 AND owner_id=$2',[id,ownerId])).rowCount)
    throw new AppError({status:403,code:'PROVENANCE_FORBIDDEN',message:'La boleta debe pertenecer a tu cuenta.'});
}
export async function uploadProvenance(db,ownerId,bytes,contentType){
  const mime=provenanceMime(bytes);if(!mime||mime!==contentType?.split(';')[0])throw invalid();
  const client=await db.connect(),id=randomUUID();let saved=false,releaseError;
  try{
    await client.query('BEGIN');requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE',[ownerId])).rows[0]);
    const pending=(await client.query(`SELECT count(*)::int AS total FROM provenance_files f WHERE owner_id=$1
      AND NOT EXISTS(SELECT 1 FROM publications WHERE provenance_evidence_ref='/api/publications/provenance/'||f.id::text)`,[ownerId])).rows[0].total;
    if(pending>=20)throw new AppError({status:429,code:'PROVENANCE_QUOTA',message:'Tienes demasiadas boletas sin asociar. Guarda tu publicación antes de subir más.'});
    await provenanceStorage.save(id,bytes);saved=true;
    await client.query('INSERT INTO provenance_files(id,owner_id,mime,byte_size)VALUES($1,$2,$3,$4)',[id,ownerId,mime,bytes.length]);
    await client.query('COMMIT');return {ref:url(id),mime,size:bytes.length};
  }catch(error){
    try{await client.query('ROLLBACK');}catch(failure){releaseError=failure;}
    if(saved)await provenanceStorage.remove(id).catch(()=>{});throw error;
  }finally{client.release(releaseError);}
}
export async function readProvenance(db,userId,id){
  if(!provenancePattern.test(url(id)))throw new AppError({status:404,code:'FILE_NOT_FOUND',message:'Boleta no encontrada.'});
  const client=await db.connect();let releaseError;
  try{
    await client.query('BEGIN');const user=requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE',[userId])).rows[0]);
    const file=(await client.query('SELECT * FROM provenance_files WHERE id=$1',[id])).rows[0];
    const publication=(await client.query('SELECT id FROM publications WHERE provenance_evidence_ref=$1 ORDER BY id LIMIT 1',[url(id)])).rows[0];
    if(!file||(file.owner_id!==userId&&!(user.role==='Administrador'&&publication)))throw new AppError({status:404,code:'FILE_NOT_FOUND',message:'Boleta no encontrada.'});
    const bytes=await provenanceStorage.read(id);
    if(provenanceMime(bytes)!==file.mime)throw invalid();
    await appendAudit(client,{actorId:userId,action:'publication.evidence.downloaded',entityType:publication?'publication':'provenance_file',entityId:publication?.id||id,metadata:{source:'private-provenance-download'}});
    await client.query('COMMIT');return {bytes,mime:file.mime};
  }catch(error){try{await client.query('ROLLBACK');}catch(failure){releaseError=failure;}throw error;}
  finally{client.release(releaseError);}
}
