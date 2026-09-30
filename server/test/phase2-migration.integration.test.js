import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
const migrationNames = ['001_init.sql', '002_foundations.sql', '003_identity_publications.sql', '004_publication_image_positions.sql'];

describe.skipIf(!enabled)('Phase 2 identity and publication migration', () => {
  let admin;
  let db;
  let databaseName;
  let directory;
  let runMigrations;

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') {
      throw new Error('Migration tests require the disposable PostgreSQL cluster.');
    }
    process.env.DATABASE_URL = url.href;
    process.env.JWT_SECRET = 'phase2-migration-test-secret';
    admin = new pg.Pool({ connectionString: url.href });
    ({ runMigrations } = await import('../src/db/migrate.js'));
  });

  beforeEach(async () => {
    databaseName = `phase2_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.pathname = `/${databaseName}`;
    db = new pg.Pool({ connectionString: url.href });
    directory = await mkdtemp(join(tmpdir(), 'ranti-phase2-migrations-'));
  });

  afterEach(async () => {
    if (db) await db.end();
    if (databaseName) await admin.query(`DROP DATABASE "${databaseName}"`);
    if (directory) await rm(directory, { recursive: true, force: true });
  });
  afterAll(async () => { if (admin) await admin.end(); });

  async function runRecordedFoundations() {
    for (const name of migrationNames.slice(0, 2)) {
      await writeFile(join(directory, name), await readFile(new URL(`../src/db/migrations/${name}`, import.meta.url)));
    }
    expect(await runMigrations(db, { directory })).toEqual({ applied: migrationNames.slice(0, 2), skipped: [] });
  }

  async function insertUser(email, role = 'Egresado') {
    return (await db.query(`INSERT INTO users (email, password_hash, role)
      VALUES ($1, 'legacy-password-hash', $2) RETURNING id`, [email, role])).rows[0].id;
  }

  it('applies all migrations cleanly, records raw-byte checksums, and skips them on a second run', async () => {
    expect(await runMigrations(db)).toEqual({ applied: migrationNames, skipped: [] });
    const rows = (await db.query('SELECT name, checksum FROM schema_migrations ORDER BY name')).rows;
    expect(rows.map(({ name }) => name)).toEqual(migrationNames);
    for (const { name, checksum } of rows) {
      const bytes = await readFile(new URL(`../src/db/migrations/${name}`, import.meta.url));
      expect(bytes.includes(13), `${name} must use LF`).toBe(false);
      expect(checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
    expect(await runMigrations(db)).toEqual({ applied: [], skipped: migrationNames });
    expect((await db.query('SELECT count(*)::int AS count FROM schema_migrations')).rows[0].count).toBe(4);
  });

  it('upgrades recorded 001+002 without changing legacy user and publication data or relationships', async () => {
    await runRecordedFoundations();
    const ownerId = await insertUser('legacy-owner@example.test');
    const reviewerId = await insertUser('legacy-admin@example.test', 'Administrador');
    const publicationId = (await db.query(`INSERT INTO publications
      (owner_id, title, description, category, condition, modality, price, status)
      VALUES ($1, 'Legacy title', 'Legacy description', 'Books', 'Used', 'Venta', 25.50, 'Activa') RETURNING id`,
    [ownerId])).rows[0].id;

    expect(await runMigrations(db)).toEqual({ applied: migrationNames.slice(2), skipped: migrationNames.slice(0, 2) });
    expect((await db.query('SELECT id, email, password_hash, role FROM users WHERE id = $1', [ownerId])).rows[0])
      .toMatchObject({ id: ownerId, email: 'legacy-owner@example.test', password_hash: 'legacy-password-hash', role: 'Egresado' });
    expect((await db.query(`SELECT id, owner_id, title, description, category, condition, modality,
      price::text, status, risk_policy_version, reviewed_by FROM publications WHERE id = $1`, [publicationId])).rows[0])
      .toEqual({ id: publicationId, owner_id: ownerId, title: 'Legacy title', description: 'Legacy description',
        category: 'Books', condition: 'Used', modality: 'Venta', price: '25.50', status: 'Activa',
        risk_policy_version: null, reviewed_by: null });
    const user = (await db.query('SELECT * FROM users WHERE id = $1', [ownerId])).rows[0];
    for (const column of ['display_name', 'avatar_url', 'faculty', 'terms_accepted_at', 'terms_version', 'verified_at', 'identity_provider']) {
      expect(user[column], `users.${column}`).toBeNull();
    }
    const publication = (await db.query('SELECT * FROM publications WHERE id = $1', [publicationId])).rows[0];
    for (const column of ['provenance_evidence_ref', 'available_from', 'available_until', 'submitted_at',
      'review_reason', 'reviewed_at', 'published_at']) {
      expect(publication[column], `publications.${column}`).toBeNull();
    }
    await db.query('UPDATE publications SET reviewed_by = $1 WHERE id = $2', [reviewerId, publicationId]);
    await expect(db.query('UPDATE publications SET reviewed_by = $1 WHERE id = $2', [randomUUID(), publicationId]))
      .rejects.toMatchObject({ code: '23503' });
    expect(await runMigrations(db)).toEqual({ applied: [], skipped: migrationNames });
  });

  async function legacyImages(count = 4) {
    for (const name of migrationNames.slice(0, 3)) await writeFile(join(directory, name),
      await readFile(new URL(`../src/db/migrations/${name}`, import.meta.url)));
    await runMigrations(db, { directory });
    const owner = await insertUser('images@ucsm.edu.pe');
    const id = (await db.query(`INSERT INTO publications (owner_id,title,description,category,condition,modality)
      VALUES ($1,'Title','Description','Category','Used','Venta') RETURNING id`, [owner])).rows[0].id;
    // Primary first, then timestamp and UUID is the specified deterministic legacy order.
    for (let i = 0; i < count; i++) await db.query(`INSERT INTO publication_images
      (id,publication_id,image_url,is_primary,created_at) VALUES ($1,$2,$3,$4,'2026-09-01')`,
    [`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, id, `https://images.test/${i}`, i === 2]);
    return id;
  }
  it('backfills stable zero-based image positions on recorded 003 and enforces null/range/uniqueness constraints', async () => {
    const id = await legacyImages();
    expect(await runMigrations(db)).toEqual({ applied: ['004_publication_image_positions.sql'], skipped: migrationNames.slice(0, 3) });
    expect((await db.query('SELECT image_url,position FROM publication_images WHERE publication_id=$1 ORDER BY position', [id])).rows)
      .toEqual([{ image_url: 'https://images.test/2', position: 0 }, { image_url: 'https://images.test/0', position: 1 },
        { image_url: 'https://images.test/1', position: 2 }, { image_url: 'https://images.test/3', position: 3 }]);
    const sql = 'INSERT INTO publication_images (publication_id,image_url,position) VALUES ($1,\'https://images.test/new\',$2)';
    await expect(db.query(sql, [id, null])).rejects.toMatchObject({ code: '23502' });
    for (const position of [-1, 4]) await expect(db.query(sql, [id, position])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query(sql, [id, 1])).rejects.toMatchObject({ code: '23505' });
    expect(await runMigrations(db)).toEqual({ applied: [], skipped: migrationNames });
  });
  it('fails image-position migration atomically rather than discarding legacy galleries above four images', async () => {
    const id = await legacyImages(5);
    await expect(runMigrations(db)).rejects.toThrow();
    expect((await db.query('SELECT image_url FROM publication_images WHERE publication_id=$1', [id])).rows).toHaveLength(5);
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='publication_images' AND column_name='position'")).rows).toEqual([]);
    expect((await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r => r.name)).toEqual(migrationNames.slice(0, 3));
  });

  it('stores hashed challenges with bounded attempts, valid lifecycle states, and normalized email', async () => {
    await runMigrations(db);
    const userId = await insertUser('student@ucsm.edu.pe');
    const sql = `INSERT INTO identity_challenges
      (user_id, email, purpose, provider, code_hash, expires_at)
      VALUES ($1, $2, 'registration', 'simulated', $3, now() + interval '10 minutes') RETURNING *`;
    const row = (await db.query(sql, [userId, 'student@ucsm.edu.pe', 'bcrypt-hash-only'])).rows[0];
    expect(row).toMatchObject({ user_id: userId, email: 'student@ucsm.edu.pe', purpose: 'registration',
      provider: 'simulated', code_hash: 'bcrypt-hash-only', status: 'pending', attempts: 0 });
    expect(row.max_attempts).toBeGreaterThan(0);
    expect(row.provider_reference).toBeNull();
    expect(row.consumed_at).toBeNull();
    for (const column of ['expires_at', 'created_at', 'updated_at']) expect(row[column]).toBeInstanceOf(Date);
    const columns = (await db.query(`SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'identity_challenges'`)).rows.map(({ column_name }) => column_name);
    expect(columns).toContain('code_hash');
    expect(columns.filter((name) => /code/i.test(name))).toEqual(['code_hash']);

    await expect(db.query('UPDATE identity_challenges SET attempts = -1 WHERE id = $1', [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query('UPDATE identity_challenges SET max_attempts = 0 WHERE id = $1', [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE identity_challenges SET status = 'unknown' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE identity_challenges SET email = 'STUDENT@UCSM.EDU.PE' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE identity_challenges SET email = 'student @ucsm.edu.pe' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query('UPDATE identity_challenges SET user_id = $1 WHERE id = $2', [randomUUID(), row.id]))
      .rejects.toMatchObject({ code: '23503' });
    await db.query("UPDATE identity_challenges SET status = 'pending', provider_reference = 'retry-later' WHERE id = $1", [row.id]);
    const retry = (await db.query(sql, [userId, 'student@ucsm.edu.pe', null])).rows[0];
    expect(retry).toMatchObject({ status: 'pending', code_hash: null, provider_reference: null });
    await db.query("UPDATE identity_challenges SET status = 'consumed', consumed_at = now() WHERE id = $1", [row.id]);
    await expect(db.query("UPDATE identity_challenges SET status = 'consumed', consumed_at = NULL WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('enforces student request evidence, decision trail, one pending request, and reviewer FK', async () => {
    await runMigrations(db);
    const userId = await insertUser('requester@ucsm.edu.pe');
    const reviewerId = await insertUser('reviewer@ucsm.edu.pe', 'Administrador');
    const sql = `INSERT INTO role_requests (user_id, requested_role, evidence_ref, evidence_metadata)
      VALUES ($1, 'Estudiante', $2, $3) RETURNING *`;
    const row = (await db.query(sql, [userId, 'https://evidence.example.test/opaque-id', { kind: 'student-card' }])).rows[0];
    expect(row).toMatchObject({ user_id: userId, requested_role: 'Estudiante', status: 'pending',
      evidence_ref: 'https://evidence.example.test/opaque-id', evidence_metadata: { kind: 'student-card' },
      reviewed_by: null, review_reason: null, reviewed_at: null });
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.updated_at).toBeInstanceOf(Date);
    await expect(db.query(sql, [userId, 'https://evidence.example.test/another', {}]))
      .rejects.toMatchObject({ code: '23505' });
    await expect(db.query("UPDATE role_requests SET requested_role = 'Administrador' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET status = 'invalid' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET evidence_ref = 'http://evidence.example.test/id' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET evidence_metadata = '[]'::jsonb WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET status = 'approved' WHERE id = $1", [row.id]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2",
      [reviewerId, row.id])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET status = 'approved', reviewed_by = $1, review_reason = ' ', reviewed_at = now() WHERE id = $2",
      [reviewerId, row.id])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE role_requests SET status = 'approved', reviewed_by = $1, review_reason = 'Valid evidence' WHERE id = $2",
      [reviewerId, row.id])).rejects.toMatchObject({ code: '23514' });
    await expect(db.query(sql, [randomUUID(), 'https://evidence.example.test/orphan', {}]))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query("UPDATE role_requests SET status = 'rejected', reviewed_by = $1, review_reason = 'No', reviewed_at = now() WHERE id = $2",
      [randomUUID(), row.id])).rejects.toMatchObject({ code: '23503' });
    await db.query("UPDATE role_requests SET status = 'rejected', reviewed_by = $1, review_reason = 'Evidence incomplete', reviewed_at = now() WHERE id = $2",
      [reviewerId, row.id]);
    expect((await db.query(sql, [userId, 'https://evidence.example.test/new-request', {}])).rows[0].status).toBe('pending');
  });

  it.each(['https://@', 'https://host:bad', 'https://host:0', 'https://host:65536',
    'https://host:99999', 'https://host:9999999999999999999999'])(
    'rejects a malformed HTTPS evidence authority: %s', async (malformedReference) => {
      await runMigrations(db);
      const userId = await insertUser('evidence@ucsm.edu.pe');
      const { id } = (await db.query(`INSERT INTO role_requests (user_id, evidence_ref)
        VALUES ($1, 'https://evidence.example.test:443/opaque-id?sig=abc') RETURNING id`, [userId])).rows[0];
      await expect(db.query('UPDATE role_requests SET evidence_ref = $1 WHERE id = $2', [malformedReference, id]))
        .rejects.toMatchObject({ code: '23514' });
    },
  );

  it('accepts HTTPS evidence references without a port and with boundary ports', async () => {
    await runMigrations(db);
    const userId = await insertUser('valid-evidence@ucsm.edu.pe');
    const { id } = (await db.query(`INSERT INTO role_requests (user_id, evidence_ref)
      VALUES ($1, 'https://host/path') RETURNING id`, [userId])).rows[0];
    for (const reference of ['https://host:1/path', 'https://host:65535/path', 'https://host/path']) {
      const row = (await db.query('UPDATE role_requests SET evidence_ref = $1 WHERE id = $2 RETURNING evidence_ref',
        [reference, id])).rows[0];
      expect(row.evidence_ref).toBe(reference);
    }
  });

  it('rejects incomplete publication date windows while accepting ordered windows', async () => {
    await runMigrations(db);
    const ownerId = await insertUser('publisher@ucsm.edu.pe');
    const publicationId = (await db.query(`INSERT INTO publications
      (owner_id, title, description, category, condition, modality)
      VALUES ($1, 'Textbook', 'Current edition', 'Books', 'Used', 'Alquiler') RETURNING id`, [ownerId])).rows[0].id;
    await expect(db.query("UPDATE publications SET available_from = now() WHERE id = $1", [publicationId]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE publications SET available_from = now(), available_until = now() WHERE id = $1", [publicationId]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(db.query("UPDATE publications SET available_from = now(), available_until = now() - interval '1 hour' WHERE id = $1", [publicationId]))
      .rejects.toMatchObject({ code: '23514' });
    await db.query("UPDATE publications SET available_from = now(), available_until = now() + interval '1 day' WHERE id = $1", [publicationId]);
  });
});
