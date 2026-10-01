import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { appendAudit } from '../audit/audit.repository.js';
import { enqueueOutboxEvent } from '../outbox/outbox.repository.js';
import { isUcsmInstitutionalEmail } from './identity-provider.js';
import { passwordInput } from './password-input.js';

const email = z.string().trim().toLowerCase().refine(isUcsmInstitutionalEmail);
const registrationInput = z.object({
  email,
  password: passwordInput,
  acceptTerms: z.literal(true),
  termsVersion: z.string().trim().min(1).max(100),
  academic_condition: z.string().trim().max(100).optional(),
});
const confirmationInput = z.object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) });

// Never propagate arbitrary provider/database messages, causes, input, or hashes.
export class IdentityError extends Error {
  constructor(code, status, message, retryable = false) {
    super(message);
    this.name = 'IdentityError'; this.code = code; this.status = status; this.retryable = retryable;
  }
}
const invalidChallenge = () => new IdentityError('IDENTITY_INVALID_CHALLENGE', 400, 'Verificación inválida o no disponible.');
const unavailable = () => new IdentityError('IDENTITY_UNAVAILABLE', 503, 'La verificación no está disponible. Inténtalo nuevamente.', true);
const safeError = error => error instanceof IdentityError ? error :
  new IdentityError('IDENTITY_INTERNAL_ERROR', 500, 'No se pudo completar la solicitud.');
const parse = (schema, input) => {
  const result = schema.safeParse(input);
  if (!result.success) throw new IdentityError('IDENTITY_INVALID_INPUT', 400, 'Revisa los datos y la aceptación de términos.');
  return result.data;
};
const publicUser = user => ({ id: user.id, email: user.email, role: user.role,
  status: user.status, verification_status: user.verification_status });
const canVerify = user => user?.status === 'Pendiente de verificación' &&
  user.verification_status === 'No verificado' && user.terms_accepted_at && user.terms_version;

async function transaction(db, work) {
  let client;
  try {
    client = await db.connect();
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch { /* Preserve the safe primary error. */ } }
    throw safeError(error);
  } finally { if (client) client.release(); }
}

async function issueChallenge(db, provider, address) {
  return transaction(db, async client => {
    const user = (await client.query('SELECT * FROM users WHERE email = $1 FOR UPDATE', [address])).rows[0];
    if (!canVerify(user)) throw invalidChallenge();
    await client.query(`UPDATE identity_challenges SET status = 'invalidated', updated_at = clock_timestamp()
      WHERE user_id = $1 AND status IN ('pending', 'sent')`, [user.id]);
    let challenge;
    try { challenge = await provider.requestVerification(user.email); }
    catch { return { status: 'verification_unavailable', retryable: true, user: publicUser(user) }; }
    const row = (await client.query(`INSERT INTO identity_challenges
      (user_id, email, purpose, provider, provider_reference, code_hash, status, expires_at, max_attempts)
      VALUES ($1, $2, 'registration', $3, $4, $5, 'sent', $6, 5) RETURNING id, expires_at`,
    [user.id, user.email, provider.name, challenge.providerReference ?? null, challenge.codeHash ?? null, challenge.expiresAt])).rows[0];
    const result = { status: 'verification_pending', user: publicUser(user), challenge_id: row.id, expires_at: row.expires_at };
    if (env.IDENTITY_PROVIDER === 'simulated' && env.IDENTITY_SIMULATOR_EXPOSE_CODE && provider.name === 'simulated') {
      result.simulation_code = challenge.code;
    }
    return result;
  });
}

export async function registerPendingAccount(db, provider, input) {
  const data = parse(registrationInput, input);
  try {
    const passwordHash = await bcrypt.hash(data.password, 10);
    // Commit the pending account before contacting the provider so resend can
    // recover from an outage. The unique email index arbitrates concurrent callers.
    await db.query(`INSERT INTO users
      (email, password_hash, role, academic_condition, status, verification_status, terms_accepted_at, terms_version)
      VALUES ($1, $2, 'Egresado', $3, 'Pendiente de verificación', 'No verificado', clock_timestamp(), $4)`,
    [data.email, passwordHash, data.academic_condition ?? null, data.termsVersion]);
    return await issueChallenge(db, provider, data.email);
  } catch (error) {
    if (error.code === '23505') throw new IdentityError('IDENTITY_CONFLICT', 409, 'El correo ya está registrado.');
    throw safeError(error);
  }
}

export async function resendVerification(db, provider, input) {
  const data = parse(z.object({ email }), input);
  return issueChallenge(db, provider, data.email);
}

export async function verifyPendingAccount(db, provider, input) {
  const data = parse(confirmationInput, input);
  const result = await transaction(db, async client => {
    const candidate = (await client.query('SELECT user_id FROM identity_challenges WHERE id = $1', [data.challengeId])).rows[0];
    if (!candidate) throw invalidChallenge();
    // Always lock user before challenge, also used by resend, to avoid lock inversion.
    const user = (await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [candidate.user_id])).rows[0];
    const challenge = (await client.query('SELECT * FROM identity_challenges WHERE id = $1 FOR UPDATE', [data.challengeId])).rows[0];
    if (!canVerify(user) || !challenge || challenge.status !== 'sent' || challenge.purpose !== 'registration' ||
        challenge.provider !== provider.name || challenge.email !== user.email || challenge.attempts >= challenge.max_attempts) {
      throw invalidChallenge();
    }
    const expired = async () => (await client.query(
      'SELECT expires_at <= clock_timestamp() AS expired FROM identity_challenges WHERE id = $1', [challenge.id])).rows[0].expired;
    if (await expired()) {
      await client.query("UPDATE identity_challenges SET status = 'expired', updated_at = clock_timestamp() WHERE id = $1", [challenge.id]);
      return { error: invalidChallenge() };
    }
    let valid, identity;
    try {
      valid = await provider.verifyChallenge(challenge, data.code);
      if (valid === true) identity = await provider.resolveInstitutionalIdentity(user.email);
    } catch { throw unavailable(); }
    if (valid !== true) {
      await client.query(`UPDATE identity_challenges SET attempts = attempts + 1,
        status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE status END,
        updated_at = clock_timestamp() WHERE id = $1`, [challenge.id]);
      // Commit attempt accounting, then reject outside the transaction.
      return { error: invalidChallenge() };
    }
    if (identity?.email !== user.email || identity?.provider !== provider.name) throw unavailable();
    if (await expired()) {
      await client.query("UPDATE identity_challenges SET status = 'expired', updated_at = clock_timestamp() WHERE id = $1", [challenge.id]);
      return { error: invalidChallenge() };
    }
    const verified = (await client.query(`UPDATE users SET status = 'Activa', verification_status = 'Verificado',
      verified_at = clock_timestamp(), identity_provider = $2 WHERE id = $1 RETURNING *`, [user.id, provider.name])).rows[0];
    await appendAudit(client, { actorId: user.id, action: 'identity.verified', entityType: 'user', entityId: user.id,
      oldValues: { status: user.status, verification_status: user.verification_status },
      newValues: { status: verified.status, verification_status: verified.verification_status, identity_provider: provider.name } });
    await enqueueOutboxEvent(client, { aggregateType: 'user', aggregateId: user.id, eventType: 'identity.verified',
      payload: { userId: user.id, provider: provider.name }, deduplicationKey: `identity.verified:${user.id}` });
    await client.query(`UPDATE identity_challenges SET status = 'consumed', consumed_at = clock_timestamp(),
      updated_at = clock_timestamp() WHERE id = $1`, [challenge.id]);
    return { user: publicUser(verified) };
  });
  if (result.error) throw result.error;
  return result;
}
