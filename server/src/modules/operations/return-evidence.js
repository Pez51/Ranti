import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { appendAudit } from '../audit/audit.repository.js';
import { photoMime } from '../users/photo-storage.js';

const unavailable = (status, message) => new AppError({ status, code: 'RETURN_EVIDENCE', message, details: null });
const missing = () => unavailable(404, 'No se encontró la devolución o la evidencia.');

async function withAccess(db, id, actor, work) {
  if (!z.uuid().safeParse(id).success) throw missing();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ref = (await client.query('SELECT publication_id FROM operations WHERE id=$1 AND $2 IN (demandante_id,oferente_id)', [id, actor])).rows[0];
    if (!ref) throw missing();
    await client.query('SELECT id FROM publications WHERE id=$1 FOR UPDATE', [ref.publication_id]);
    const op = (await client.query('SELECT * FROM operations WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (op.modality !== 'Alquiler' || !op.contract_snapshot?.workflow_payment) throw missing();
    const result = await work(client, op);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

export async function returnEvidenceList(db, id) {
  const { rows } = await db.query(`SELECT id,name,mime,phase,uploaded_at FROM operation_return_evidence
    WHERE operation_id=$1 ORDER BY uploaded_at,id`, [id]);
  return rows;
}

export function readReturnEvidence(db, id, actor) {
  return withAccess(db, id, actor, async client => ({ evidence: await returnEvidenceList(client, id) }));
}

export function uploadReturnEvidence(db, id, actor, bytes, contentType, name) {
  const mime = photoMime(bytes);
  if (!mime || mime !== contentType || !z.string().trim().min(1).max(180).safeParse(name).success) {
    throw unavailable(400, 'Adjunta una foto JPEG, PNG o WebP de hasta 2 MB con un nombre válido.');
  }
  return withAccess(db, id, actor, async (client, op) => {
    const owner = actor === op.oferente_id;
    const phase = owner ? 'inspection' : 'return';
    const record = (await client.query('SELECT proposed_cents FROM operation_return_settlements WHERE operation_id=$1', [id])).rows[0];
    if (op.status !== 'Entregada/Activa' || (owner && !record) || (record && record.proposed_cents !== null)) {
      throw unavailable(409, 'La etapa de devolución ya cambió. Usa el expediente de incidencia para aportar evidencias adicionales.');
    }
    const count = await client.query('SELECT id FROM operation_return_evidence WHERE operation_id=$1 AND phase=$2', [id, phase]);
    if (count.rowCount >= 5) throw unavailable(409, 'Cada parte puede adjuntar hasta cinco fotos al acta.');
    const file = (await client.query(`INSERT INTO operation_return_evidence(operation_id,uploaded_by,phase,name,mime,bytes)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [id, actor, phase, name.trim(), mime, bytes])).rows[0];
    await appendAudit(client, { actorId: actor, action: 'return.evidence_uploaded', entityType: 'operation',
      entityId: id, newValues: { file_id: file.id, phase } });
    return { evidence: await returnEvidenceList(client, id) };
  });
}

export async function returnEvidenceFile(db, id, actor, fileId) {
  if (!z.uuid().safeParse(fileId).success) throw missing();
  const file = (await db.query('SELECT name,mime,bytes FROM operation_return_evidence WHERE id=$1 AND operation_id=$2',
    [fileId, id])).rows[0];
  if (!file) throw missing();
  await appendAudit(db, { actorId: actor, action: 'return.evidence_downloaded', entityType: 'operation',
    entityId: id, newValues: { file_id: fileId } });
  return file;
}

export function downloadReturnEvidence(db, id, actor, fileId) {
  return withAccess(db, id, actor, client => returnEvidenceFile(client, id, actor, fileId));
}
