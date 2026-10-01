import { randomUUID } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
describe.skipIf(!enabled)('verified institutional registration with disposable PostgreSQL', () => {
  let db, provider, registerPendingAccount, resendVerification, verifyPendingAccount, app;
  const input = (override = {}) => ({ email: `identity-${randomUUID()}@ucsm.edu.pe`, password: 'identity-password',
    acceptTerms: true, termsVersion: '2026-09', ...override });
  const readUser = async id => (await db.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
  const readChallenge = async id => (await db.query('SELECT * FROM identity_challenges WHERE id = $1', [id])).rows[0];
  const confirm = (registration, adapter = provider) => verifyPendingAccount(db, adapter,
    { challengeId: registration.challenge_id, code: registration.simulation_code });
  const effects = async id => ({
    audit: (await db.query("SELECT * FROM audit_logs WHERE entity_id = $1 AND action = 'identity.verified'", [id])).rows,
    outbox: (await db.query("SELECT * FROM outbox_events WHERE aggregate_id = $1 AND event_type = 'identity.verified'", [id])).rows,
  });

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test')
      throw new Error('Identity integration tests require the disposable local database.');
    db = new pg.Pool({ connectionString: url.href });
    await (await import('../src/db/migrate.js')).runMigrations(db);
    vi.stubEnv('IDENTITY_PROVIDER', 'simulated');
    vi.stubEnv('IDENTITY_SIMULATOR_EXPOSE_CODE', 'true');
    vi.resetModules();
    vi.doMock('../src/config/database.js', () => ({ default: db }));
    const module = await import('../src/modules/identity/identity.service.js').catch(() => ({}));
    ({ registerPendingAccount, resendVerification, verifyPendingAccount } = module);
    const adapter = await import('../src/modules/identity/simulated-identity-provider.js').catch(() => ({}));
    provider = adapter.SimulatedIdentityProvider && new adapter.SimulatedIdentityProvider();
    app = express(); app.use(express.json());
    app.use('/api/auth', (await import('../src/routes/auth.routes.js')).default);
  });
  afterAll(async () => { vi.unstubAllEnvs(); vi.doUnmock('../src/config/database.js'); if (db) await db.end(); });

  it.each([
    ['base domain', local => `${local}@ucsm.edu.pe`],
    ['subdomain', local => `${local}@faculty.ucsm.edu.pe`],
    ['uppercase and whitespace', local => ` ${local.toUpperCase()}@FACULTY.UCSM.EDU.PE `],
    ['64-byte local part', local => `${local.padEnd(64, 'a')}@ucsm.edu.pe`],
    ['63-byte DNS label', local => `${local}@${'a'.repeat(63)}.ucsm.edu.pe`],
    ['254-byte address', local => `${local.padEnd(64, 'a')}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(49)}.ucsm.edu.pe`],
    ['internal hostname hyphen', local => `${local}@valid-label.ucsm.edu.pe`],
  ])('registers valid institutional email boundary: %s', async (_name, makeEmail) => {
    const email = makeEmail(randomUUID());
    const response = await request(app).post('/api/auth/register').send(input({ email }));
    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty('token');
    expect((await readUser(response.body.user.id)).email).toBe(email.trim().toLowerCase());
    expect((await readChallenge(response.body.challenge_id)).email).toBe(email.trim().toLowerCase());
  });

  it.each([
    ['trailing hostname hyphen', local => `${local}@bad-.ucsm.edu.pe`],
    ['leading hostname hyphen', local => `${local}@-bad.ucsm.edu.pe`],
    ['64-byte DNS label', local => `${local}@${'a'.repeat(64)}.ucsm.edu.pe`],
    ['65-byte local part', local => `${local.padEnd(65, 'a')}@ucsm.edu.pe`],
    ['255-byte address', local => `${local.padEnd(64, 'a')}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(50)}.ucsm.edu.pe`],
    ['hostname underscore', local => `${local}@bad_label.ucsm.edu.pe`],
    ['empty hostname label', local => `${local}@bad..ucsm.edu.pe`],
    ['non-ASCII hostname label', local => `${local}@facultád.ucsm.edu.pe`],
  ])('rejects malformed institutional registration without persisting an account: %s', async (_name, makeEmail) => {
    const email = makeEmail(randomUUID());
    const response = await request(app).post('/api/auth/register').send(input({ email }));
    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'IDENTITY_INVALID_INPUT' });
    expect(response.body).not.toHaveProperty('token');
    expect((await db.query('SELECT id FROM users WHERE email = $1', [email])).rows).toEqual([]);
    expect((await db.query('SELECT id FROM identity_challenges WHERE email = $1', [email])).rows).toEqual([]);
  });

  it('stores consent and hashes, ignores caller role, and emits no JWT before verification', async () => {
    const data = input({ email: ` Identity-${randomUUID()}@FACULTAD.UCSM.EDU.PE `, role: 'Administrador' });
    const response = await request(app).post('/api/auth/register').send(data);
    expect(response.status).toBe(201);
    expect(response.body).not.toHaveProperty('token');
    expect(response.body.simulation_code).toMatch(/^\d{6}$/);
    const user = await readUser(response.body.user.id);
    expect(user).toMatchObject({ email: data.email.trim().toLowerCase(), role: 'Egresado',
      status: 'Pendiente de verificación', verification_status: 'No verificado', terms_version: '2026-09' });
    expect(user.terms_accepted_at).toBeInstanceOf(Date);
    expect(await bcrypt.compare(data.password, user.password_hash)).toBe(true);
    const challenge = await readChallenge(response.body.challenge_id);
    expect(challenge).toMatchObject({ attempts: 0, max_attempts: 5, status: 'sent' });
    expect(await bcrypt.compare(response.body.simulation_code, challenge.code_hash)).toBe(true);
    expect(JSON.stringify(challenge)).not.toContain(response.body.simulation_code);
    expect(JSON.stringify(response.body)).not.toMatch(/password|hash/);
  });

  it.each(['a'.repeat(72), 'é'.repeat(36)])('uses the same 72-byte password boundary for registration and login: %s', async password => {
    const data = input({ password }); const registered = await registerPendingAccount(db, provider, data);
    await confirm(registered);
    expect((await request(app).post('/api/auth/login').send({ email: data.email, password })).status).toBe(200);
    for (const invalidPassword of [password + 'a', password + 'é', 'é'.repeat(40)]) {
      const rejected = await request(app).post('/api/auth/login').send({ email: data.email, password: invalidPassword });
      expect.soft(rejected.status).toBe(400); expect.soft(rejected.body).not.toHaveProperty('token');
      await expect(registerPendingAccount(db, provider, input({ password: invalidPassword })))
        .rejects.toMatchObject({ status: 400, code: 'IDENTITY_INVALID_INPUT' });
    }
  });

  it('rejects duplicate/concurrent normalized registration without replacing the original password or consent', async () => {
    const data = input();
    const results = await Promise.allSettled([registerPendingAccount(db, provider, data),
      registerPendingAccount(db, provider, { ...data, email: data.email.toUpperCase(), password: 'other-password' })]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(row => row.status === 'rejected').reason).toMatchObject({ code: 'IDENTITY_CONFLICT', status: 409 });
    expect((await db.query('SELECT id FROM users WHERE email = $1', [data.email])).rows).toHaveLength(1);
  });

  it('confirms once under concurrency, atomically records effects, and returns identity for login', async () => {
    const data = input(); const registration = await registerPendingAccount(db, provider, data);
    const results = await Promise.allSettled([confirm(registration), confirm(registration)]);
    expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(row => row.status === 'rejected').reason).toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
    const user = await readUser(registration.user.id);
    expect(user).toMatchObject({ status: 'Activa', verification_status: 'Verificado', identity_provider: 'simulated' });
    expect(user.verified_at).toBeInstanceOf(Date);
    expect(await readChallenge(registration.challenge_id)).toMatchObject({ status: 'consumed', consumed_at: expect.any(Date) });
    const recorded = await effects(user.id);
    expect(recorded.audit).toHaveLength(1); expect(recorded.outbox).toHaveLength(1);
    expect(JSON.stringify(recorded)).not.toMatch(/password|code_hash|simulation_code|identity-password/);
    const login = await request(app).post('/api/auth/login').send(data);
    expect(login.status).toBe(200); expect(login.body.token).toBeTypeOf('string');
    expect(login.body.user).toMatchObject({ role: 'Egresado' });
    await db.query("UPDATE users SET role = 'Administrador' WHERE id = $1", [user.id]);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`);
    expect(me.body.user.role).toBe('Administrador');
  });

  it('keeps the legacy token/user response on confirm and exposes no secret fields', async () => {
    const registration = await registerPendingAccount(db, provider, input());
    const response = await request(app).post('/api/auth/verification/confirm')
      .send({ challengeId: registration.challenge_id, code: registration.simulation_code });
    expect(response.status).toBe(200); expect(response.body.token).toBeTypeOf('string');
    expect(response.body.user).toMatchObject({ id: registration.user.id, status: 'Activa' });
    expect(JSON.stringify(response.body)).not.toMatch(/password|code_hash|simulation_code/);
    expect((await request(app).post('/api/auth/verification/confirm')
      .send({ challengeId: registration.challenge_id, code: registration.simulation_code })).status).toBe(400);
  });

  it('rejects expired challenges and persists expiry', async () => {
    const registration = await registerPendingAccount(db, provider, input());
    await db.query("UPDATE identity_challenges SET expires_at = now() - interval '1 second' WHERE id = $1", [registration.challenge_id]);
    await expect(confirm(registration)).rejects.toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
    expect((await readChallenge(registration.challenge_id)).status).toBe('expired');
    expect((await readUser(registration.user.id)).verified_at).toBeNull();
  });

  it('persists wrong attempts and locks the challenge after five, even with the correct code', async () => {
    const registration = await registerPendingAccount(db, provider, input());
    const wrong = registration.simulation_code === '000000' ? '000001' : '000000';
    for (let attempt = 1; attempt <= 5; attempt++) {
      await expect(verifyPendingAccount(db, provider, { challengeId: registration.challenge_id, code: wrong }))
        .rejects.toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
      expect((await readChallenge(registration.challenge_id)).attempts).toBe(attempt);
    }
    await expect(confirm(registration)).rejects.toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
    expect((await readChallenge(registration.challenge_id)).status).toBe('failed');
  });

  it('resend invalidates old challenges, including concurrent resend, and only one remains usable', async () => {
    const data = input(); const first = await registerPendingAccount(db, provider, data);
    const results = await Promise.all([resendVerification(db, provider, data), resendVerification(db, provider, data)]);
    expect((await readChallenge(first.challenge_id)).status).toBe('invalidated');
    await expect(confirm(first)).rejects.toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
    const rows = (await db.query("SELECT id FROM identity_challenges WHERE user_id = $1 AND status = 'sent'", [first.user.id])).rows;
    expect(rows).toHaveLength(1);
    await confirm(results.find(row => row.challenge_id === rows[0].id));
  });

  it('preserves a pending account on provider request failure, and resend recovers without leaking the error', async () => {
    const data = input();
    const unavailable = Object.create(provider);
    unavailable.requestVerification = async () => { throw new Error('password=secret raw-code=123456 token=private'); };
    const registration = await registerPendingAccount(db, unavailable, data);
    expect(registration).toMatchObject({ status: 'verification_unavailable', retryable: true });
    expect(registration).not.toHaveProperty('token');
    expect(JSON.stringify(registration)).not.toMatch(/secret|123456|private|password|hash/);
    expect((await readUser(registration.user.id)).verified_at).toBeNull();
    const response = await request(app).post('/api/auth/verification/resend').send({ email: data.email });
    expect(response.status).toBe(200);
    await confirm(response.body);
  });

  it.each(['verifyChallenge', 'resolveInstitutionalIdentity'])('provider %s outage never verifies and retry recovers', async method => {
    const registration = await registerPendingAccount(db, provider, input());
    const unavailable = Object.create(provider); unavailable[method] = async () => { throw new Error('private token=secret'); };
    await expect(confirm(registration, unavailable)).rejects.toMatchObject({ code: 'IDENTITY_UNAVAILABLE', status: 503 });
    expect((await readUser(registration.user.id)).verified_at).toBeNull();
    expect((await readChallenge(registration.challenge_id)).attempts).toBe(0);
    await confirm(registration);
  });

  it.each(['audit_logs', 'outbox_events'])('rolls back every verification effect if %s fails, then deduplicates retry', async table => {
    const registration = await registerPendingAccount(db, provider, input());
    // Failure injection wraps only the failing SQL boundary; all other operations hit PostgreSQL.
    const failingDb = { connect: async () => {
      const client = await db.connect();
      return { release: () => client.release(), query: (sql, args) => {
        if (sql.includes(`INSERT INTO ${table}`)) throw new Error('password=secret SQL token=private');
        return client.query(sql, args);
      } };
    } };
    const error = await verifyPendingAccount(failingDb, provider,
      { challengeId: registration.challenge_id, code: registration.simulation_code }).catch(error => error);
    expect(error).toMatchObject({ code: 'IDENTITY_INTERNAL_ERROR' });
    expect(String(error)).not.toMatch(/secret|SQL|private|password/);
    expect((await readUser(registration.user.id)).verified_at).toBeNull();
    expect((await readChallenge(registration.challenge_id)).status).toBe('sent');
    expect(await effects(registration.user.id)).toEqual({ audit: [], outbox: [] });
    await confirm(registration);
    await expect(confirm(registration)).rejects.toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
    const recorded = await effects(registration.user.id);
    expect(recorded.audit).toHaveLength(1); expect(recorded.outbox).toHaveLength(1);
  });

  it('returns indistinguishable login rejection for missing, wrong-password, pending, rejected, suspended, and unverified accounts', async () => {
    const data = input(); const registration = await registerPendingAccount(db, provider, data);
    const responses = [await request(app).post('/api/auth/login').send(input()),
      await request(app).post('/api/auth/login').send({ ...data, password: 'wrong-password' }),
      await request(app).post('/api/auth/login').send(data)];
    for (const [status, verification] of [['Activa', 'No verificado'], ['Activa', 'Rechazado'], ['Suspendida', 'Verificado']]) {
      await db.query('UPDATE users SET status = $2, verification_status = $3 WHERE id = $1', [registration.user.id, status, verification]);
      responses.push(await request(app).post('/api/auth/login').send(data));
      await expect(confirm(registration)).rejects.toMatchObject({ code: 'IDENTITY_INVALID_CHALLENGE' });
    }
    for (const response of responses) {
      expect(response.status).toBe(401); expect(response.body).toEqual(responses[0].body);
      expect(response.body).not.toHaveProperty('token');
    }
  });

  it('never discloses codes when simulator disclosure is disabled', async () => {
    vi.stubEnv('IDENTITY_SIMULATOR_EXPOSE_CODE', 'false'); vi.resetModules();
    const hidden = await import('../src/modules/identity/identity.service.js');
    const registration = await hidden.registerPendingAccount(db, provider, input());
    expect(registration).not.toHaveProperty('simulation_code');
    expect(JSON.stringify(registration)).not.toMatch(/code_hash|password_hash|token/);
    vi.stubEnv('IDENTITY_SIMULATOR_EXPOSE_CODE', 'true');
  });
});
