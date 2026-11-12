import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { appendAudit } from '../audit/audit.repository.js';
import { provenanceMime } from '../publications/provenance-files.js';
import { isAcademicSelection } from '../users/academic-catalog.js';
import { requireCurrentUser } from '../users/profile.service.js';
import { IdentityError } from './identity.service.js';
import { passwordInput } from './password-input.js';

const audience = 'ranti-graduate-accreditation';
const absentPasswordHash = bcrypt.hashSync('unusable-graduate-placeholder', 10);
const accessInput = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()), password: passwordInput }).strict();
const text = max => z.string().trim().min(1).max(max);
const evidenceInput = z.object({ name: text(180), content: z.base64().max(6_990_508) }).strict();
const registrationInput = accessInput.extend({
  name: text(140), documentNumber: z.string().trim().regex(/^\d{8}$/),
  faculty: text(120).optional(), career: text(100).optional(),
  acceptedTerms: z.literal(true), declaredCorrect: z.literal(true), evidence: evidenceInput,
}).strict().refine(data => (!data.faculty && !data.career) || isAcademicSelection(data.faculty, data.career));
const correctionInput = z.object({ revision: z.number().int().positive(), evidence: evidenceInput,
  name: text(140).optional(), documentNumber: z.string().trim().regex(/^\d{8}$/).optional(),
  faculty: text(120).optional(), career: text(100).optional(),
}).strict().refine(data => (!data.faculty && !data.career) || isAcademicSelection(data.faculty, data.career));
const decisionInput = z.object({ revision: z.number().int().positive(), decision: z.enum(['approve', 'observe', 'reject']),
  reason: text(3000), correction: text(1000).optional(),
}).strict().refine(data => data.decision !== 'observe' || Boolean(data.correction));
const states = { approve: 'Verificado', observe: 'Pendiente de subsanación', reject: 'Rechazado' };
const queueInput = z.object({ status: z.enum(['En revisión', ...Object.values(states)]).optional(),
  offset: z.string().regex(/^\d{1,5}$/).transform(Number).optional(),
}).strict();

const invalid = message => new IdentityError('ACCREDITATION_INVALID', 400, message);
const missing = () => new IdentityError('ACCREDITATION_NOT_FOUND', 404, 'Expediente o constancia no encontrados.');
const unavailable = () => new IdentityError('ACCREDITATION_LOGIN', 401, 'Verifica tus credenciales de acreditación.');
const stale = () => new IdentityError('ACCREDITATION_CHANGED', 409, 'El expediente cambió. Vuelve a consultarlo antes de continuar.');

function parse(schema, input, message) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw invalid(message);
  return parsed.data;
}

function pdf(evidence) {
  const bytes = Buffer.from(evidence.content, 'base64');
  if (provenanceMime(bytes) !== 'application/pdf') throw invalid('Adjunta una constancia PDF válida de hasta 5 MB.');
  return bytes;
}

function portalToken(id) {
  return jwt.sign({}, env.JWT_SECRET, { algorithm: 'HS256', audience, subject: id, expiresIn: '2h' });
}

export function accreditationSubject(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'], audience });
    if (typeof payload === 'object' && z.uuid().safeParse(payload.sub).success) return payload.sub;
  } catch { /* Return the same response for expired and invalid access. */ }
  throw unavailable();
}

async function transaction(db, work) {
  const client = await db.connect();
  let releaseError;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (failure) { releaseError = failure; }
    throw error;
  } finally { client.release(releaseError); }
}

function view(row) {
  return { id: row.id, reference: `ACR-${row.id.slice(0, 8).toUpperCase()}`, status: row.status, revision: row.revision,
    name: row.display_name, faculty: row.faculty, career: row.career, reason: row.reason, correction: row.correction,
    documentLast4: row.document_last4, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

const selection = 'a.*, u.display_name, u.email, u.faculty, u.career';

async function readCase(client, id, byOwner = true) {
  if (!z.uuid().safeParse(id).success) throw missing();
  const { rows: [ref] } = await client.query(`SELECT user_id FROM graduate_accreditations WHERE ${byOwner ? 'user_id' : 'id'}=$1`, [id]);
  if (!ref) throw missing();
  const { rows: [user] } = await client.query('SELECT status FROM users WHERE id=$1 FOR SHARE', [ref.user_id]);
  if (!user || user.status === 'Suspendida') throw missing();
  const { rows: [row] } = await client.query(`SELECT ${selection} FROM graduate_accreditations a
    JOIN users u ON u.id=a.user_id WHERE a.user_id=$1 FOR SHARE OF a`, [ref.user_id]);
  if (!row) throw missing();
  return row;
}

async function detail(client, row) {
  const evidence = await client.query(`SELECT id,name,revision,octet_length(bytes) AS size
    FROM graduate_accreditation_evidence WHERE accreditation_id=$1 ORDER BY revision`, [row.id]);
  const history = await client.query(`SELECT status,reason,correction,created_at AS "createdAt"
    FROM graduate_accreditation_events WHERE accreditation_id=$1 ORDER BY revision`, [row.id]);
  return { ...view(row), email: row.email, evidence: evidence.rows, history: history.rows };
}

async function adminAccount(client, actorId) {
  const { rows } = await client.query('SELECT status,verification_status,role FROM users WHERE id=$1 FOR SHARE', [actorId]);
  const actor = requireCurrentUser(rows[0]);
  if (actor.role !== 'Administrador') throw new IdentityError('ACCREDITATION_FORBIDDEN', 403, 'No tienes permiso para revisar acreditaciones.');
}

async function history(client, row, actorId, requestId, action, previous = null) {
  await client.query(`INSERT INTO graduate_accreditation_events(accreditation_id,revision,actor_id,status,reason,correction)
    VALUES($1,$2,$3,$4,$5,$6)`, [row.id, row.revision, actorId, row.status, row.reason, row.correction]);
  await appendAudit(client, { actorId, requestId, action, entityType: 'graduate_accreditation', entityId: row.id,
    oldValues: previous && { status: previous.status, revision: previous.revision },
    newValues: { status: row.status, revision: row.revision } });
}

async function saveProof(client, row, name, bytes) {
  await client.query(`INSERT INTO graduate_accreditation_evidence(accreditation_id,revision,name,bytes)
    VALUES($1,$2,$3,$4)`, [row.id, row.revision, name, bytes]);
}

export async function registerGraduate(db, requestId, input) {
  const data = parse(registrationInput, input, 'Revisa los datos de cuenta, DNI, constancia PDF y consentimientos.');
  const bytes = pdf(data.evidence);
  const password = await bcrypt.hash(data.password, 10);
  try {
    return await transaction(db, async client => {
      const { rows: [user] } = await client.query(`INSERT INTO users(email,password_hash,role,display_name,faculty,career,
        status,verification_status,terms_accepted_at,terms_version)
        VALUES($1,$2,'Egresado',$3,$4,$5,'Pendiente de verificación','En revisión',clock_timestamp(),'pilot-v1') RETURNING id`,
      [data.email, password, data.name, data.faculty ?? null, data.career ?? null]);
      const { rows: [row] } = await client.query(`INSERT INTO graduate_accreditations(user_id,document_last4) VALUES($1,$2) RETURNING *`,
        [user.id, data.documentNumber.slice(-4)]);
      await saveProof(client, row, data.evidence.name, bytes);
      await history(client, row, user.id, requestId, 'accreditation.submitted');
      return { token: portalToken(user.id), application: await detail(client, await readCase(client, user.id)) };
    });
  } catch (error) {
    if (error.code === '23505') throw new IdentityError('ACCREDITATION_EXISTS', 409, 'Ese correo ya está registrado. Ingresa para consultar tu cuenta.');
    throw error;
  }
}

export async function accessGraduate(db, input) {
  const data = parse(accessInput, input, 'Ingresa un correo y contraseña válidos.');
  const { rows: [user] } = await db.query(`SELECT u.id,u.email,u.role,u.status,u.verification_status,u.password_hash
    FROM users u JOIN graduate_accreditations a ON a.user_id=u.id WHERE u.email=$1`, [data.email]);
  if (!await bcrypt.compare(data.password, user?.password_hash ?? absentPasswordHash) || !user || user.status === 'Suspendida') throw unavailable();
  const application = await readGraduate(db, user.id);
  const active = user.status === 'Activa' && user.verification_status === 'Verificado' && application.status === 'Verificado';
  return { token: portalToken(user.id), application, user: active ? { id: user.id, email: user.email, role: user.role,
    status: user.status, verification_status: user.verification_status } : null };
}

export async function readGraduate(db, userId) {
  return transaction(db, async client => detail(client, await readCase(client, userId)));
}

async function lockCase(client, id, byOwner) {
  if (!z.uuid().safeParse(id).success) throw missing();
  const { rows: [ref] } = await client.query(`SELECT user_id FROM graduate_accreditations WHERE ${byOwner ? 'user_id' : 'id'}=$1`, [id]);
  if (!ref) throw missing();
  const { rows: [user] } = await client.query('SELECT status FROM users WHERE id=$1 FOR UPDATE', [ref.user_id]);
  if (user?.status !== 'Pendiente de verificación') throw stale();
  const { rows: [row] } = await client.query('SELECT * FROM graduate_accreditations WHERE user_id=$1 FOR UPDATE', [ref.user_id]);
  return row;
}

export async function correctGraduate(db, userId, requestId, input) {
  const data = parse(correctionInput, input, 'Revisa los datos de corrección y adjunta la constancia actualizada.');
  const bytes = pdf(data.evidence);
  return transaction(db, async client => {
    const old = await lockCase(client, userId, true);
    if (old.status !== 'Pendiente de subsanación' || old.revision !== data.revision) throw stale();
    const { rows: [row] } = await client.query(`UPDATE graduate_accreditations SET status='En revisión',revision=revision+1,
      reason=NULL,correction=NULL,document_last4=COALESCE($2,document_last4),updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
    [old.id, data.documentNumber?.slice(-4) ?? null]);
    await client.query(`UPDATE users SET verification_status='En revisión',display_name=COALESCE($2,display_name),
      faculty=COALESCE($3,faculty),career=COALESCE($4,career),updated_at=clock_timestamp() WHERE id=$1`,
    [userId, data.name ?? null, data.faculty ?? null, data.career ?? null]);
    await saveProof(client, row, data.evidence.name, bytes);
    await history(client, row, userId, requestId, 'accreditation.corrected', old);
    return detail(client, await readCase(client, userId));
  });
}

export async function listGraduateAccreditations(db, actorId, input) {
  const { status, offset = 0 } = parse(queueInput, input, 'Selecciona un estado de acreditación válido.');
  return transaction(db, async client => {
    await adminAccount(client, actorId);
    const { rows } = await client.query(`SELECT a.id,a.status,a.updated_at,u.display_name FROM graduate_accreditations a JOIN users u ON u.id=a.user_id
      WHERE ($1::verification_status IS NULL OR a.status=$1) AND u.status<>'Suspendida'
      ORDER BY (a.status<>'En revisión'),a.updated_at DESC,a.id LIMIT 21 OFFSET $2`, [status ?? null, offset]);
    return { items: rows.slice(0, 20).map(view).map(({ id, reference, status, name, updatedAt }) => ({ id, reference, status, name, updatedAt })),
      nextOffset: rows.length > 20 ? offset + 20 : null };
  });
}

export async function readAdminGraduate(db, actorId, requestId, id) {
  return transaction(db, async client => {
    await adminAccount(client, actorId);
    const row = await readCase(client, id, false);
    await appendAudit(client, { actorId, requestId, action: 'accreditation.viewed', entityType: 'graduate_accreditation', entityId: id });
    return detail(client, row);
  });
}

export async function decideGraduate(db, actorId, requestId, id, input) {
  const data = parse(decisionInput, input, 'Selecciona un resultado, escribe el motivo y detalla la corrección si corresponde.');
  return transaction(db, async client => {
    await adminAccount(client, actorId);
    const old = await lockCase(client, id, false);
    if (old.user_id === actorId) throw new IdentityError('ACCREDITATION_SELF_REVIEW', 403, 'Otro administrador debe revisar tu acreditación.');
    if (old.status !== 'En revisión' || old.revision !== data.revision) throw stale();
    const { rows: [row] } = await client.query(`UPDATE graduate_accreditations SET status=$2,reason=$3,correction=$4,
      revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
    [id, states[data.decision], data.reason, data.decision === 'observe' ? data.correction : null]);
    const approved = data.decision === 'approve';
    await client.query(`UPDATE users SET status=CASE WHEN $3 THEN 'Activa'::user_status ELSE status END,
      verification_status=$2,academic_condition=CASE WHEN $3 THEN 'Egresado' ELSE academic_condition END,
      verified_at=CASE WHEN $3 THEN clock_timestamp() ELSE verified_at END,
      identity_provider=CASE WHEN $3 THEN 'graduate_review' ELSE identity_provider END,updated_at=clock_timestamp() WHERE id=$1`,
    [old.user_id, row.status, approved]);
    await history(client, row, actorId, requestId, `accreditation.${data.decision}`, old);
    return detail(client, await readCase(client, id, false));
  });
}

export async function readGraduateEvidence(db, actorId, requestId, id, fileId, admin = false) {
  if (!z.uuid().safeParse(fileId).success) throw missing();
  return transaction(db, async client => {
    if (admin) await adminAccount(client, actorId);
    const row = await readCase(client, id, !admin);
    const { rows: [file] } = await client.query(`SELECT name,bytes FROM graduate_accreditation_evidence
      WHERE accreditation_id=$1 AND id=$2`, [row.id, fileId]);
    if (!file) throw missing();
    await appendAudit(client, { actorId, requestId, action: 'accreditation.evidence.downloaded', entityType: 'graduate_accreditation',
      entityId: row.id, metadata: { file_id: fileId } });
    return file;
  });
}
