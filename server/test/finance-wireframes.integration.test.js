import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDisposableDatabase } from './helpers/disposable-database.js';

const enabled = process.env.RANTI_EPHEMERAL_DB === '1' && Boolean(process.env.TEST_DATABASE_URL);
describe.skipIf(!enabled)('finance wireframes through the HTTP routes', () => {
  let database, db, app, buyer, owner, admin;
  const auth = id => ({ Authorization: `Bearer ${jwt.sign({ id }, process.env.JWT_SECRET)}` });
  const get = (path, user = buyer) => request(app).get(path).set(auth(user));
  const post = (path, body, user = buyer) => request(app).post(path).set(auth(user)).send(body);

  beforeAll(async () => {
    database = await createDisposableDatabase();
    db = database.db;
    await (await import('../src/db/migrate.js')).runMigrations(db);
    const user = async role => (await db.query(`INSERT INTO users
      (email,password_hash,role,status,verification_status,display_name)
      VALUES($1,'unused',$2,'Activa','Verificado','Cuenta de prueba') RETURNING id`,
    [`${randomUUID()}@ucsm.edu.pe`, role])).rows[0].id;
    buyer = await user('Egresado');
    owner = await user('Egresado');
    admin = await user('Administrador');
    vi.doMock('../src/config/database.js', () => ({ default: db }));
    app = (await import('../src/app.js')).default;
  });
  afterAll(async () => {
    vi.doUnmock('../src/config/database.js');
    await database?.close();
  });

  async function startSale() {
    const pub = (await db.query(`INSERT INTO publications
      (owner_id,title,description,category,condition,modality,price,guarantee_amount,status)
      VALUES($1,'Venta financiera','Prueba','Tecnología','Bueno','Venta',40,0,'Activa') RETURNING id`, [owner])).rows[0];
    const response = await post('/api/operations', { publication_id: pub.id, requested_price: '40.00',
      requested_guarantee_amount: '0.00', requested_contract_version: 1 });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const id = response.body.operation.id;
    const url = `/api/operations/${id}`;
    expect((await post(`${url}/accept`, {}, owner)).status).toBe(200);
    expect((await post(`${url}/handoff`, { action: 'propose', revision: 0, location: 'Biblioteca UCSM',
      meeting_at: new Date(Date.now() + 3600000).toISOString() }, owner)).status).toBe(200);
    expect((await post(`${url}/handoff`, { action: 'agree', revision: 1 })).status).toBe(200);
    return { id, url: `${url}/finance` };
  }

  async function newPayload(url, scenario) {
    const quote = await post(`${url}/quotes`, { method: 'simulated' });
    expect(quote.status, JSON.stringify(quote.body)).toBe(200);
    return { quote_id: quote.body.id, idempotency_key: randomUUID(), accepted_total: quote.body.buyer.total,
      confirm_test: true, scenario };
  }

  it('archives a failed attempt, preserves pending identity and emits documents after reconciliation', async () => {
    const { id, url } = await startSale();
    const oldPayload = await newPayload(url, 'failed');
    const failed = await post(`${url}/payments`, oldPayload);
    expect(failed.body).toMatchObject({ payment: { status: 'failed' }, can_retry_payment: true, documents: [] });
    const pending = await post(`${url}/payments`, await newPayload(url, 'pending'));
    expect(pending.body.payment.status).toBe('pending');
    const original = pending.body.payment.id;
    expect(original).not.toBe(failed.body.payment.id);
    expect((await post(`${url}/payments`, oldPayload)).status).toBe(200);
    expect((await post(`${url}/quotes`, { method: 'simulated' })).status).toBe(409);
    expect((await post(`${url}/payments/${original}/consult`, {})).body.payment.id).toBe(original);
    expect((await get(`${url}/documents/sale`)).status).toBe(409);
    const result = await post(`/api/admin/finance/${id}/payments/${original}/consult`,
      { evidence: 'Resultado del canal de prueba', outcome: 'confirmed' }, admin);
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(result.body.payment).toMatchObject({ id: original, status: 'simulated_succeeded' });
    const doc = await get(`${url}/documents/sale`);
    expect(doc.body).toMatchObject({ side: 'buyer', amount: '36.00' });
    expect((await get(`${url}/documents/sale`, owner)).status).toBe(404);
    expect((await db.query('SELECT id FROM operation_finance_payments WHERE operation_id=$1', [id])).rowCount).toBe(2);
  });

  it('records an idempotent movement review and keeps the original charge and payout after a chargeback', async () => {
    const { id, url } = await startSale();
    const paid = await post(`${url}/payments`, await newPayload(url, 'success'));
    const reference = `ABONO-PRUEBA-${id}`;
    await db.query(`UPDATE operation_finance_transfers SET status='confirmed',mechanism='simulated',
      external_reference=$2,confirmed_at=clock_timestamp() WHERE operation_id=$1`, [id, reference]);
    const adminPath = `/api/admin/finance/${id}`;
    const ledger = await get(`/api/admin/finance?search=${reference}`, admin);
    expect(ledger.status, JSON.stringify(ledger.body)).toBe(200);
    expect(ledger.body.items).toHaveLength(1);
    expect(ledger.body.items[0].movements).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'payout', reference })]));
    const reviewUrl = `${adminPath}/movements/payout/review`;
    const evidence = { outcome: 'unknown', verification_reference: 'consulta-fixture', evidence: 'Verificación pendiente' };
    expect((await get(reviewUrl)).status).toBe(403);
    expect((await post(reviewUrl, evidence, admin)).body.reviews).toHaveLength(1);
    expect((await post(reviewUrl, evidence, admin)).body.reviews).toHaveLength(1);
    const chargebackUrl = `${adminPath}/chargeback`;
    const open = { action: 'open', amount_cents: '1000', reference: `disputa-${id}`, evidence: 'Expediente de prueba' };
    expect((await post(chargebackUrl, { ...open, amount_cents: '4001' }, admin)).status).toBe(409);
    const opened = await post(chargebackUrl, open, admin);
    expect(opened.status, JSON.stringify(opened.body)).toBe(200);
    expect((await post(chargebackUrl, open, admin)).body.id).toBe(opened.body.id);
    const lost = await post(chargebackUrl, { action: 'resolve', status: 'lost', recovery: 'receivable',
      reference: 'resultado-fixture', evidence: 'Resolución de prueba' }, admin);
    expect(lost.body).toMatchObject({ id: opened.body.id, status: 'lost', recovery: 'receivable' });
    expect((await get(url)).body.payment.id).toBe(paid.body.payment.id);
    expect((await get(`${url}/documents/payout`, owner)).body.reference).toBe(reference);
  });
});
