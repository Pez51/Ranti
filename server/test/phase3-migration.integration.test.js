import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && !!process.env.TEST_DATABASE_URL;
const historical = ['001_init.sql', '002_foundations.sql', '003_identity_publications.sql', '004_publication_image_positions.sql'];
const all = [...historical, '005_operation_status_values.sql', '006_operations_reservations.sql'];
const first = '2026-11-01T10:00:00Z';
const middle = '2026-11-02T10:00:00Z';
const last = '2026-11-03T10:00:00Z';

describe.skipIf(!enabled)('Phase 3 operation and reservation migration', () => {
  let cluster, db, databaseName, historicalDirectory, runMigrations;
  let owner, requester, publication;

  async function user() {
    return (await db.query(`INSERT INTO users (email,password_hash,role,status,verification_status)
      VALUES ($1,'hash','Estudiante','Activa','Verificado') RETURNING id`, [`${randomUUID()}@example.test`])).rows[0].id;
  }

  async function makePublication(modality = 'Alquiler') {
    return (await db.query(`INSERT INTO publications
      (owner_id,title,description,category,condition,modality,price,guarantee_amount,status)
      VALUES ($1,'Equipment','Useful','Science','Used',$2,25,5,'Activa') RETURNING id`,
    [owner, modality])).rows[0].id;
  }

  async function legacyOperation({ publicationId = publication, modality = 'Alquiler', status = 'Aceptada',
    start = first, end = middle, snapshot = { agreed_price: 25, guarantee_amount: 5 } } = {}) {
    return (await db.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,contract_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [publicationId, requester, owner, modality, status, start, end, snapshot])).rows[0].id;
  }

  async function legacyReservation(operationId, { publicationId = publication, start = first, end = middle,
    status = 'Reservada/Bloqueada' } = {}) {
    return (await db.query(`INSERT INTO reservations (publication_id,operation_id,start_date,end_date,status)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`, [publicationId, operationId, start, end, status])).rows[0].id;
  }

  async function upgrade() { return runMigrations(db); }
  async function expectRejectedUpgrade() {
    const before = (await db.query('SELECT * FROM operations ORDER BY id')).rows;
    const reservations = (await db.query('SELECT * FROM reservations ORDER BY id')).rows;
    await expect(upgrade()).rejects.toThrow();
    expect((await db.query("SELECT name FROM schema_migrations WHERE name='006_operations_reservations.sql'")).rows).toEqual([]);
    expect((await db.query('SELECT * FROM operations ORDER BY id')).rows).toEqual(before);
    expect((await db.query('SELECT * FROM reservations ORDER BY id')).rows).toEqual(reservations);
  }

  beforeAll(async () => {
    const url = new URL(process.env.TEST_DATABASE_URL);
    if (url.hostname !== '127.0.0.1' || url.pathname !== '/ranti_test' || url.username !== 'ranti_test') throw Error('Disposable DB required');
    cluster = new pg.Pool({ connectionString: url.href });
    databaseName = `phase3_migration_${randomUUID().replaceAll('-', '')}`;
    await cluster.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    db = new pg.Pool({ connectionString: url.href });
    historicalDirectory = await mkdtemp(join(tmpdir(), 'ranti-phase3-history-'));
    for (const name of historical) await writeFile(join(historicalDirectory, name),
      await readFile(new URL(`../src/db/migrations/${name}`, import.meta.url)));
    ({ runMigrations } = await import('../src/db/migrate.js'));
  });

  beforeEach(async () => {
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
    await runMigrations(db, { directory: historicalDirectory });
    owner = await user(); requester = await user(); publication = await makePublication();
  });

  afterAll(async () => {
    if (db) await db.end();
    if (databaseName && cluster) await cluster.query(`DROP DATABASE "${databaseName}"`);
    if (cluster) await cluster.end();
    if (historicalDirectory) await rm(historicalDirectory, { recursive: true, force: true });
  });

  it('installs 001–006 in a clean database and records immutable checksums on one upgrade', async () => {
    await db.query('DROP SCHEMA public CASCADE'); await db.query('CREATE SCHEMA public');
    expect(await upgrade()).toEqual({ applied: all, skipped: [] });
    const rows = (await db.query('SELECT name,checksum FROM schema_migrations ORDER BY name')).rows;
    expect(rows.map(row => row.name)).toEqual(all);
    for (const row of rows) expect(row.checksum).toBe(createHash('sha256')
      .update(await readFile(new URL(`../src/db/migrations/${row.name}`, import.meta.url))).digest('hex'));
    expect(await upgrade()).toEqual({ applied: [], skipped: all });
    expect((await db.query(`SELECT enumlabel FROM pg_enum WHERE enumtypid='operation_status'::regtype ORDER BY enumsortorder`)).rows
      .map(row => row.enumlabel).slice(-3)).toEqual(['Rechazada', 'Expirada', 'Cancelación en reversión']);
  });

  it('preserves advanced legacy rows and effects, and backfills accepted and released metadata', async () => {
    const operationId = await legacyOperation({ snapshot: { agreed_price: '21.50', guarantee_amount: '3.25' } });
    const reservationId = await legacyReservation(operationId, { status: 'Disponible' });
    await db.query(`INSERT INTO audit_logs (actor_id,action,entity_type,entity_id)
      VALUES ($1,'legacy.action','operation',$2)`, [owner, operationId]);
    await db.query(`INSERT INTO outbox_events (aggregate_type,aggregate_id,event_type,payload,deduplication_key)
      VALUES ('operation',$1,'legacy.action','{}',$2)`, [operationId, randomUUID()]);
    expect(await upgrade()).toEqual({ applied: all.slice(4), skipped: historical });
    const op = (await db.query('SELECT * FROM operations WHERE id=$1', [operationId])).rows[0];
    expect(op.contract_snapshot).toEqual({ agreed_price: '21.50', guarantee_amount: '3.25' });
    expect(op.accepted_at).toEqual(op.created_at); expect(op.decided_at).toEqual(op.created_at);
    expect(op.decided_by).toBe(owner); expect(op.requested_price).toBe('21.50');
    expect(op.requested_guarantee_amount).toBe('3.25'); expect(op.requested_contract_version).toBe('1');
    const reservation = (await db.query('SELECT * FROM reservations WHERE id=$1', [reservationId])).rows[0];
    expect(reservation.released_at).toEqual(reservation.created_at);
    expect(reservation.release_reason).toBe('legacy_status_backfill');
    expect((await db.query('SELECT count(*)::int AS n FROM audit_logs WHERE entity_id=$1', [operationId])).rows[0].n).toBe(1);
    expect((await db.query('SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id=$1', [operationId])).rows[0].n).toBe(1);
    expect(await upgrade()).toEqual({ applied: [], skipped: all });
  });

  it('uses snapshot economics with publication fallback for legacy accepted operations', async () => {
    const operationId = await legacyOperation({ snapshot: {} });
    await upgrade();
    expect((await db.query('SELECT requested_price,requested_guarantee_amount FROM operations WHERE id=$1', [operationId])).rows[0])
      .toEqual({ requested_price: '25.00', requested_guarantee_amount: '5.00' });
  });

  it('tracks only contractual publication changes and registers exactly the specified transition edges', async () => {
    await upgrade();
    await db.query('UPDATE publications SET status=$2,risk_level=2 WHERE id=$1', [publication, 'Pausada']);
    expect((await db.query('SELECT contract_version FROM publications WHERE id=$1', [publication])).rows[0].contract_version).toBe('1');
    await db.query('UPDATE publications SET title=$2,price=$3 WHERE id=$1', [publication, 'New title', '27.00']);
    expect((await db.query('SELECT contract_version FROM publications WHERE id=$1', [publication])).rows[0].contract_version).toBe('2');
    await db.query('UPDATE publications SET title=title WHERE id=$1', [publication]);
    expect((await db.query('SELECT contract_version FROM publications WHERE id=$1', [publication])).rows[0].contract_version).toBe('2');
    const rules = (await db.query(`SELECT from_status::text AS source,to_status::text AS target,actor_kind,precondition_key,effect_key
      FROM operation_transition_rules ORDER BY source,target,actor_kind,precondition_key`)).rows;
    expect(rules).toHaveLength(8);
    expect(rules).toEqual(expect.arrayContaining([
      { source: 'Pendiente', target: 'Aceptada', actor_kind: 'owner', precondition_key: 'request_available', effect_key: 'create_reservation' },
      { source: 'Pendiente', target: 'Rechazada', actor_kind: 'owner', precondition_key: 'pending_request', effect_key: 'no_reservation' },
      { source: 'Pendiente', target: 'Rechazada', actor_kind: 'owner', precondition_key: 'publication_invalidated', effect_key: 'no_reservation' },
      { source: 'Pendiente', target: 'Cancelada', actor_kind: 'requester', precondition_key: 'pending_request', effect_key: 'no_reservation' },
      { source: 'Pendiente', target: 'Expirada', actor_kind: 'system', precondition_key: 'expired_request', effect_key: 'no_reservation' },
      { source: 'Aceptada', target: 'Cancelada', actor_kind: 'requester', precondition_key: 'pre_economic', effect_key: 'release_reservation' },
      { source: 'Pendiente de pago/garantía', target: 'Cancelación en reversión', actor_kind: 'requester', precondition_key: 'pre_delivery', effect_key: 'retain_reservation' },
      { source: 'Lista para entrega', target: 'Cancelación en reversión', actor_kind: 'requester', precondition_key: 'pre_delivery', effect_key: 'retain_reservation' },
    ]));
    expect((await db.query(`SELECT * FROM operation_transition_rules WHERE from_status='Pendiente'
      AND to_status='Rechazada' AND actor_kind='owner' AND precondition_key='pending_request'`)).rowCount).toBe(1);
    expect((await db.query(`SELECT * FROM operation_transition_rules WHERE from_status='Pendiente'
      AND to_status='Rechazada' AND actor_kind='owner' AND precondition_key='wrong'`)).rowCount).toBe(0);
  });

  it.each([
    ['ambiguous pending request', async () => legacyOperation({ status: 'Pendiente' })],
    ['null operation status', async () => legacyOperation({ status: null })],
    ['null reservation status', async () => legacyReservation(await legacyOperation(), { status: null })],
    ['null reservation operation', async () => legacyReservation(null)],
    ['duplicate reservation operation', async () => { const id = await legacyOperation(); await legacyReservation(id); await legacyReservation(id); }],
    ['publication mismatch', async () => legacyReservation(await legacyOperation(), { publicationId: await makePublication() })],
    ['sale date mismatch', async () => legacyReservation(await legacyOperation({ publicationId: await makePublication('Venta'), modality: 'Venta', start: null, end: null }))],
    ['rental date mismatch', async () => legacyReservation(await legacyOperation(), { end: last })],
    ['invalid operation interval', async () => legacyOperation({ end: first })],
    ['invalid reservation interval', async () => legacyReservation(await legacyOperation(), { end: first })],
    ['overlapping live intervals', async () => { await legacyReservation(await legacyOperation()); await legacyReservation(await legacyOperation({ start: first, end: last }), { end: last }); }],
  ])('rejects %s before changing historical rows', async (_name, seed) => { await seed(); await expectRejectedUpgrade(); });

  it('rejects two live sale reservations during preflight', async () => {
    // Simulate a legacy installation that already allowed null sale intervals.
    await db.query('ALTER TABLE reservations ALTER COLUMN start_date DROP NOT NULL, ALTER COLUMN end_date DROP NOT NULL');
    const sale = await makePublication('Venta');
    await legacyReservation(await legacyOperation({ publicationId: sale, modality: 'Venta', start: null, end: null }),
      { publicationId: sale, start: null, end: null });
    await legacyReservation(await legacyOperation({ publicationId: sale, modality: 'Venta', start: null, end: null }),
      { publicationId: sale, start: null, end: null });
    await expectRejectedUpgrade();
  });

  it('waits for an explicit table lock before evaluating an invalid legacy row', async () => {
    await legacyOperation({ status: 'Pendiente' });
    const blocker = await db.connect();
    await blocker.query('BEGIN');
    await blocker.query('LOCK TABLE operations IN ROW EXCLUSIVE MODE');
    const migrating = upgrade().then(value => ({ value }), error => ({ error }));
    try {
      await expect.poll(async () => (await db.query(`SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%LOCK TABLE publications, operations, reservations%'`)).rows[0].n,
      { timeout: 3000 }).toBe(1);
      expect((await db.query("SELECT name FROM schema_migrations WHERE name='006_operations_reservations.sql'")).rows).toEqual([]);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
    }
    expect((await migrating).error).toBeInstanceOf(Error);
    expect((await db.query("SELECT name FROM schema_migrations WHERE name='006_operations_reservations.sql'")).rows).toEqual([]);
  });

  it('enforces reservation identity, exact intervals, sale uniqueness, and half-open overlap', async () => {
    await upgrade();
    const accepted = async (publicationId, modality, start, end) => (await db.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,contract_snapshot,
       requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,accepted_at,decided_at,decided_by)
      VALUES ($1,$2,$3,$4,'Aceptada',$5,$6,'{}',25,5,1,now()+interval '48 hours',now(),now(),$3) RETURNING id`,
    [publicationId, requester, owner, modality, start, end])).rows[0].id;
    const a = await accepted(publication, 'Alquiler', first, middle);
    const b = await accepted(publication, 'Alquiler', middle, last);
    await legacyReservation(a); await legacyReservation(b, { start: middle, end: last });
    const c = await accepted(publication, 'Alquiler', first, last);
    await expect(legacyReservation(c, { end: last })).rejects.toMatchObject({ code: '23P01' });
    await expect(db.query('UPDATE operations SET end_date=$2 WHERE id=$1', [a, last])).rejects.toThrow();
    await expect(db.query('UPDATE reservations SET end_date=$2 WHERE operation_id=$1', [a, middle])).resolves.toMatchObject({ rowCount: 1 });
    await expect(db.query('UPDATE reservations SET start_date=$2 WHERE operation_id=$1', [a, middle])).rejects.toThrow();
    await expect(db.query('UPDATE reservations SET publication_id=$2 WHERE operation_id=$1', [a, await makePublication()]))
      .rejects.toThrow();
    const sale = await makePublication('Venta');
    const saleA = await accepted(sale, 'Venta', null, null);
    const saleB = await accepted(sale, 'Venta', null, null);
    await legacyReservation(saleA, { publicationId: sale, start: null, end: null });
    await expect(legacyReservation(saleB, { publicationId: sale, start: null, end: null }))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('validates the final operation interval after two updates in one transaction', async () => {
    await upgrade();
    const id = (await db.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,contract_snapshot,
       requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,accepted_at,decided_at,decided_by)
      VALUES ($1,$2,$3,'Alquiler','Aceptada',$4,$5,'{}',25,5,1,now()+interval '48 hours',now(),now(),$3) RETURNING id`,
    [publication, requester, owner, first, middle])).rows[0].id;
    await legacyReservation(id);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE operations SET end_date=$2 WHERE id=$1', [id, last]);
      await client.query('UPDATE operations SET end_date=$2 WHERE id=$1', [id, middle]);
      await expect(client.query('COMMIT')).resolves.toMatchObject({ command: 'COMMIT' });
    } finally {
      await client.query('ROLLBACK'); client.release();
    }
    expect((await db.query('SELECT end_date FROM operations WHERE id=$1', [id])).rows[0].end_date)
      .toEqual(new Date(middle));
  });

  it('rejects null statuses, invalid release metadata, and later snapshot edits', async () => {
    await upgrade();
    await expect(db.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,requested_contract_version,request_expires_at)
      VALUES ($1,$2,$3,'Alquiler',NULL,1,now()+interval '48 hours')`, [publication, requester, owner]))
      .rejects.toMatchObject({ code: '23502' });
    const id = (await db.query(`INSERT INTO operations
      (publication_id,demandante_id,oferente_id,modality,status,start_date,end_date,contract_snapshot,
       requested_price,requested_guarantee_amount,requested_contract_version,request_expires_at,accepted_at,decided_at,decided_by)
      VALUES ($1,$2,$3,'Alquiler','Aceptada',$4,$5,'{}',25,5,1,now()+interval '48 hours',now(),now(),$3) RETURNING id`,
    [publication, requester, owner, first, middle])).rows[0].id;
    await legacyReservation(id);
    await expect(db.query('UPDATE operations SET decided_by=NULL WHERE id=$1', [id])).rejects.toThrow();
    await expect(db.query('UPDATE operations SET contract_snapshot=$2 WHERE id=$1', [id, { changed: true }])).rejects.toThrow();
    await expect(db.query("UPDATE reservations SET status='Disponible' WHERE operation_id=$1", [id])).rejects.toThrow();
    await db.query("UPDATE reservations SET status='Disponible',released_at=now(),release_reason='requester_cancelled' WHERE operation_id=$1", [id]);
    await expect(db.query("UPDATE reservations SET status='Activa/En uso' WHERE operation_id=$1", [id])).rejects.toThrow();
  });
});
