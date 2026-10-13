import { AppError } from '../../shared/errors/app-error.js';
import { isAcademicSelection } from './academic-catalog.js';
import { z } from 'zod';

const university = 'Universidad Católica de Santa María';
const invalid = () => new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
const unavailable = () => new AppError({ status: 403, code: 'ACCOUNT_UNAVAILABLE', message: 'Necesitas una cuenta activa y verificada.' });
const fields = new Set(['display_name', 'contact_number', 'faculty', 'career']);

export function requireCurrentUser(user) {
  if (!user || user.status !== 'Activa' || user.verification_status !== 'Verificado') throw unavailable();
  return user;
}

export function publicProfile(user) {
  return { id: user.id, email: user.email, role: user.role, academic_condition: user.role,
    university, display_name: user.display_name, contact_number: user.contact_number,
    avatar_url: user.avatar_url, faculty: user.faculty, career: user.career,
    reputation_score: user.reputation_score, operations_count: user.operations_count,
    created_at: user.created_at };
}

export async function getOwnProfile(db, userId) {
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  return publicProfile(requireCurrentUser(user));
}

export async function getMemberProfile(db, userId) {
  if (!z.uuid().safeParse(userId).success) throw new AppError({status:400,code:'INVALID_INPUT',message:'Usuario inválido.'});
  const row=(await db.query(`SELECT id,display_name,avatar_url,email,contact_number,reputation_score,operations_count,role,faculty,career
    FROM users WHERE id=$1 AND status='Activa' AND verification_status='Verificado'`,[userId])).rows[0];
  if(!row)throw new AppError({status:404,code:'PROFILE_NOT_FOUND',message:'Este perfil no está disponible.'});
  return {...row,university};
}

export async function updateOwnProfile(db, userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      Object.keys(patch).length === 0 || Object.keys(patch).some(key => !fields.has(key))) throw invalid();
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'display_name') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw invalid();
      changes[key] = value.trim();
    } else if (key === 'contact_number') {
      if (value !== null && (typeof value !== 'string' || !/^\+?[0-9\s()-]{6,20}$/.test(value.trim()))) throw invalid();
      changes[key] = value === null ? null : value.trim();
    } else {
      if (value !== null && (typeof value !== 'string' || !value.trim() || value.trim().length > 100)) throw invalid();
      changes[key] = value === null ? null : value.trim();
    }
  }
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  requireCurrentUser(user);
  if ('faculty' in changes || 'career' in changes) {
    const faculty = 'faculty' in changes ? changes.faculty : user.faculty;
    const career = 'career' in changes ? changes.career : user.career;
    // Non-student staff may have no academic affiliation; one field alone is never valid.
    if (!(faculty === null && career === null && !['Estudiante', 'Egresado'].includes(user.role)) &&
        !isAcademicSelection(faculty, career)) {
      throw new AppError({ status: 400, code: 'INVALID_ACADEMIC_SELECTION',
        message: 'Escoge una facultad y una carrera válida de la UCSM.' });
    }
  }
  const keys = Object.keys(changes);
  const sets = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
  const result = await db.query(`UPDATE users SET ${sets}, updated_at = clock_timestamp()
    WHERE id = $1 AND status = 'Activa' AND verification_status = 'Verificado' RETURNING *`,
  [userId, ...keys.map(key => changes[key])]);
  return publicProfile(requireCurrentUser(result.rows[0]));
}

export async function setOwnPhoto(db, userId, photoUrl) {
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  requireCurrentUser(user);
  const result = await db.query(`UPDATE users SET avatar_url = $2, updated_at = clock_timestamp()
    WHERE id = $1 AND status = 'Activa' AND verification_status = 'Verificado' RETURNING *`,
  [userId, photoUrl]);
  return publicProfile(requireCurrentUser(result.rows[0]));
}
