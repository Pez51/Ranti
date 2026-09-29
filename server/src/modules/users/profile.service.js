import { AppError } from '../../shared/errors/app-error.js';

const university = 'Universidad Católica de Santa María';
const invalid = () => new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
const unavailable = () => new AppError({ status: 403, code: 'ACCOUNT_UNAVAILABLE', message: 'Necesitas una cuenta activa y verificada.' });
const fields = new Set(['display_name', 'avatar_url', 'faculty']);
const dbHttps = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*(?::[0-9]{1,5})?(?:[/?#][^\s]*)?$/;

export function validHttpsReference(value) {
  if (typeof value !== 'string' || value.length > 2048 || !dbHttps.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return false;
    const authority = value.slice('https://'.length).split(/[/?#]/, 1)[0];
    const match = authority.match(/:([0-9]{1,5})$/);
    return !match || (Number(match[1]) >= 1 && Number(match[1]) <= 65535);
  } catch { return false; }
}

export function requireCurrentUser(user) {
  if (!user || user.status !== 'Activa' || user.verification_status !== 'Verificado') throw unavailable();
  return user;
}

export function publicProfile(user) {
  return { id: user.id, email: user.email, role: user.role, academic_condition: user.role,
    university, display_name: user.display_name, avatar_url: user.avatar_url, faculty: user.faculty,
    reputation_score: user.reputation_score, operations_count: user.operations_count,
    created_at: user.created_at };
}

export async function getOwnProfile(db, userId) {
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  return publicProfile(requireCurrentUser(user));
}

export async function updateOwnProfile(db, userId, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
      Object.keys(patch).length === 0 || Object.keys(patch).some(key => !fields.has(key))) throw invalid();
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'avatar_url') {
      if (value !== null && !validHttpsReference(value)) throw invalid();
      changes[key] = value;
    } else if (key === 'display_name') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw invalid();
      changes[key] = value.trim();
    } else {
      if (value !== null && (typeof value !== 'string' || !value.trim() || value.trim().length > 100)) throw invalid();
      changes[key] = value === null ? null : value.trim();
    }
  }
  const user = (await db.query('SELECT * FROM users WHERE id = $1', [userId])).rows[0];
  requireCurrentUser(user);
  const keys = Object.keys(changes);
  const sets = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
  const result = await db.query(`UPDATE users SET ${sets}, updated_at = clock_timestamp()
    WHERE id = $1 AND status = 'Activa' AND verification_status = 'Verificado' RETURNING *`,
  [userId, ...keys.map(key => changes[key])]);
  return publicProfile(requireCurrentUser(result.rows[0]));
}
