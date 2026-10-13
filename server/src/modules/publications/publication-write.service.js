import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { dateValue, evaluatePublicationRisk, money } from './risk.policy.js';
import { publicationPhotoPattern, publicationImageReference } from './publication-photo.js';
import { appendAudit } from '../audit/audit.repository.js';
import { provenanceReference,requireOwnedProvenance } from './provenance-files.js';

const fail = (status, message) => new AppError({ status, code: 'PUBLICATION_INVALID', message });
const fields = ['title','description','category','condition','modality','price','guarantee_amount','available_from','available_until','provenance_evidence_ref','category_other','condition_rating','rental_unit'];
export async function writePublication(db, ownerId, id, input) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [ownerId])).rows[0]);
    let previous;
    if (id) {
      previous = (await client.query('SELECT * FROM publications WHERE id=$1 AND owner_id=$2 FOR UPDATE', [id,ownerId])).rows[0];
      if (!previous) throw fail(404, 'Publicación no encontrada.');
      if (!['Borrador','Pausada','Activa'].includes(previous.status)) throw fail(409, 'No puedes editar una publicación en este estado.');
      const operations = await client.query('SELECT status FROM operations WHERE publication_id=$1 ORDER BY id FOR UPDATE', [id]);
      if (operations.rows.some(row => !['Pendiente','Cancelada','Rechazada','Expirada','Cerrada'].includes(row.status))) throw fail(409, 'La publicación tiene una operación activa.');
    }
    const data = { title:'',description:'',category:'',condition:'',modality:'Venta',price:null,guarantee_amount:0,
      available_from:null,available_until:null,provenance_evidence_ref:null,category_other:null,condition_rating:null,rental_unit:'day',...previous,...input };
    if(data.modality!=='Alquiler')data.rental_unit='day';
    if(!['hour','day','week','month'].includes(data.rental_unit))throw fail(400,'Selecciona una unidad de cobro válida.');
    if(data.description.length>1000) throw fail(400,'La descripción debe tener como máximo 1000 caracteres.');
    data.category_other=data.category==='Otros'?data.category_other?.trim()||null:null;
    if(data.provenance_evidence_ref&&!provenanceReference(data.provenance_evidence_ref))throw fail(400,'Adjunta un comprobante de procedencia válido.');
    await requireOwnedProvenance(client,data.provenance_evidence_ref,ownerId);
    if(data.condition_rating!=null){
      if(!Number.isInteger(data.condition_rating)||data.condition_rating<1||data.condition_rating>5) throw fail(400,'Selecciona de 1 a 5 estrellas.');
      data.condition=['Con desgaste importante','Con detalles visibles','Buen estado','Muy buen estado','Como nuevo'][data.condition_rating-1];
    }
    for (const key of ['price','guarantee_amount']) if (data[key] != null) data[key] = money(data[key]).text;
    const images = input.images ?? (id ? (await client.query('SELECT image_url FROM publication_images WHERE publication_id=$1 ORDER BY position', [id])).rows.map(row => row.image_url) : []);
    if (images.length > 7 || new Set(images).size !== images.length || images.some(url => !publicationImageReference(url))) throw fail(400, 'Usa hasta siete fotos diferentes.');
    for (const url of images) {
      const photoId = publicationPhotoPattern.exec(url)?.[1];
      if (photoId && !(await client.query('SELECT id FROM publication_photos WHERE id=$1 AND owner_id=$2', [photoId,ownerId])).rowCount) throw fail(403, 'Solo puedes usar fotos subidas por tu cuenta.');
    }
    for (const key of ['available_from','available_until']) if (data[key] != null) data[key] = dateValue(data[key]);
    if ((!data.available_from&&data.available_until)||(data.modality!=='Alquiler'&&Boolean(data.available_from)!==Boolean(data.available_until))||
        (data.available_from&&data.available_until&&data.available_from>=data.available_until))throw fail(400,'Indica un inicio válido y, si pones fecha de fin, debe ser posterior.');
    let risk;
    try { risk = evaluatePublicationRisk({ modality:data.modality,price:data.price,guaranteeAmount:data.guarantee_amount,availableFrom:data.available_from,availableUntil:data.available_until }); }
    catch (e) { if (previous?.status === 'Activa') throw e; }
    const normalized = (key,value) => key.startsWith('available_') ? (value ? dateValue(value).toISOString() : null)
      : ['price','guarantee_amount'].includes(key) ? (value == null ? null : Number(value)) : value;
    const contractChanged = previous && fields.some(key => normalized(key,data[key]) !== normalized(key,previous[key]));
    const status = previous?.status === 'Activa' && contractChanged ? 'Pendiente de revisión' : previous?.status || 'Borrador';
    const values = fields.map(key => data[key]);
    const statusParameter=fields.length+2;
    const row = id
      ? (await client.query(`UPDATE publications SET ${fields.map((key,i) => `${key}=$${i+2}`).join(',')},
          status=$${statusParameter}::publication_status,risk_level=$${statusParameter+1},risk_policy_version=$${statusParameter+2},
          submitted_at=CASE WHEN $${statusParameter}::publication_status='Pendiente de revisión' THEN date_trunc('milliseconds',clock_timestamp()) ELSE submitted_at END,
          reviewed_by=CASE WHEN $${statusParameter}::publication_status='Pendiente de revisión' THEN NULL ELSE reviewed_by END,
          reviewed_at=CASE WHEN $${statusParameter}::publication_status='Pendiente de revisión' THEN NULL ELSE reviewed_at END,
          review_reason=CASE WHEN $${statusParameter}::publication_status='Pendiente de revisión' THEN NULL ELSE review_reason END,
          updated_at=clock_timestamp() WHERE id=$1 RETURNING *`, [id,...values,status,risk?.level ?? null,risk?.policyVersion ?? null])).rows[0]
      : (await client.query(`INSERT INTO publications (owner_id,${fields.join(',')},status,risk_level,risk_policy_version)
          VALUES ($1,${fields.map((_,i) => `$${i+2}`).join(',')},'Borrador',$${statusParameter},$${statusParameter+1}) RETURNING *`, [ownerId,...values,risk?.level ?? null,risk?.policyVersion ?? null])).rows[0];
    await client.query('DELETE FROM publication_images WHERE publication_id=$1', [row.id]);
    for (const [position,url] of images.entries()) await client.query('INSERT INTO publication_images (publication_id,image_url,is_primary,position) VALUES ($1,$2,$3,$4)', [row.id,url,position === 0,position]);
    await appendAudit(client, { actorId:ownerId,action:id ? 'publication.updated' : 'publication.created',entityType:'publication',entityId:row.id,newValues:{status:row.status} });
    await client.query('COMMIT'); return {...row,images};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function submitPublicationDraft(db, ownerId, id) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE',[ownerId])).rows[0]);
    const row = (await client.query('SELECT * FROM publications WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,ownerId])).rows[0];
    if (!row) throw fail(404,'Publicación no encontrada.');
    const images = (await client.query('SELECT image_url FROM publication_images WHERE publication_id=$1 ORDER BY position',[id])).rows.map(row => row.image_url);
    if (row.status !== 'Borrador') throw fail(409,'Solo puedes enviar un borrador.');
    if(row.category==='Otros' && !row.category_other?.trim()) throw fail(422,'Indica el tipo de artículo en Otros.');
    if (['title','description','category','condition'].some(key => !row[key]?.trim()) || !images.length || images.length > 7) throw fail(422,'Completa los datos y agrega de 1 a 7 fotos antes de enviar.');
    const risk = evaluatePublicationRisk({modality:row.modality,price:row.price,guaranteeAmount:row.guarantee_amount,availableFrom:row.available_from,availableUntil:row.available_until});
    if (risk.requiresProvenanceEvidence && !provenanceReference(row.provenance_evidence_ref)) throw fail(422,'Adjunta la boleta de procedencia antes de enviar.');
    await requireOwnedProvenance(client,row.provenance_evidence_ref,ownerId);
    const status = risk.requiresAdminReview ? 'Pendiente de revisión' : 'Activa';
    const result = (await client.query(`UPDATE publications SET status=$2::publication_status,risk_level=$3,risk_policy_version=$4,
      submitted_at=date_trunc('milliseconds',clock_timestamp()),reviewed_by=NULL,review_reason=NULL,reviewed_at=NULL,
      published_at=CASE WHEN $2::publication_status='Activa' THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp()
      WHERE id=$1 RETURNING *`,[id,status,risk.level,risk.policyVersion])).rows[0];
    await appendAudit(client,{actorId:ownerId,action:'publication.submitted',entityType:'publication',entityId:id,newValues:{status}});
    await client.query('COMMIT'); return {...result,images};
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
