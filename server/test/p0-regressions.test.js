import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../src/config/database.js', () => ({ default: db }));

import { register } from '../src/controllers/auth.controller.js';
import { getPublications, getPublicationById, createPublication } from '../src/controllers/publication.controller.js';
import { createOperation } from '../src/controllers/operation.controller.js';

function response() {
  const res = { statusCode: 200, body: undefined };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_SECRET = 'test-secret-not-for-production';
});

describe('registro público', () => {
  it.each(['Administrador', 'Egresado'])(
    'rechaza la autoasignación del rol %s sin insertar usuario',
    async (role) => {
      db.query.mockImplementation(async (sql, params) => {
        if (sql.startsWith('SELECT')) return { rows: [] };
        return { rows: [{ id: 'user-1', email: 'persona@estudiante.ucsm.edu.pe', role: params[2], status: 'Pendiente de verificación' }] };
      });
      const res = response();
      await register({ body: {
        email: 'persona@estudiante.ucsm.edu.pe',
        password: 'clave-segura',
        role,
      } }, res);

      expect(res.statusCode).toBe(400);
      expect(db.query).not.toHaveBeenCalled();
    },
  );
});

describe('publicaciones contra el esquema entregado', () => {
  it('consulta el catálogo con la columna category', async () => {
    db.query.mockImplementation(async (sql) => {
      if (!sql.includes('p.category') || !sql.includes('AND p.category = $1')) {
        throw new Error('La consulta no usa la columna category del esquema');
      }
      return { rows: [{ id: 'pub-1', category: 'Sistemas' }] };
    });
    const res = response();

    await getPublications({ query: { faculty: 'Sistemas' } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: 'pub-1', category: 'Sistemas' }]);
  });

  it('crea una publicación usando la columna category', async () => {
    const ownerId = '00000000-0000-4000-8000-000000000002';
    const draft = { id: '00000000-0000-4000-8000-000000000003', owner_id: ownerId,
      category: 'Sistemas', status: 'Borrador', risk_level: 1, risk_policy_version: 'pilot-v1' };
    const client = { query: vi.fn(), release: vi.fn() };
    client.query.mockImplementation(async (sql) => {
      if (sql.includes('FROM users')) return { rows: [{ id: ownerId, status: 'Activa', verification_status: 'Verificado' }] };
      if (sql.includes('INSERT INTO publications')) {
        if (!sql.includes('description, category, condition')) {
          throw new Error('El INSERT no usa la columna category del esquema');
        }
        return { rows: [draft] };
      }
      return { rows: [] };
    });
    db.connect.mockResolvedValue(client);
    const res = response();

    await createPublication({
      user: { id: ownerId },
      body: {
        title: 'Calculadora', description: 'Equipo', category: 'Sistemas',
        condition: 'Usado', modality: 'Venta', price: 20, guarantee_amount: 0,
      },
    }, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.publication).toEqual({ ...draft, images: [] });
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe('detalle público de publicaciones', () => {
  const publicationId = '00000000-0000-4000-8000-000000000001';

  it('no muestra una publicación pausada', async () => {
    db.query.mockImplementation(async (sql) => ({
      rows: sql.includes("p.status = 'Activa'") ? [] : [{ id: 'pub-1', status: 'Pausada' }],
    }));
    const res = response();

    await getPublicationById({ params: { id: publicationId } }, res);

    expect(res.statusCode).toBe(404);
    expect(db.query).toHaveBeenCalledOnce();
  });

  it('no expone el correo ni otros datos internos del oferente', async () => {
    db.query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT image_url')) {
        return { rows: [{ image_url: 'https://example.test/foto.jpg', is_primary: true }] };
      }
      const row = { id: 'pub-1', title: 'Calculadora', owner_reputation_score: '4.50',
        images: [{ image_url: 'https://example.test/foto.jpg', is_primary: true }] };
      if (sql.includes('p.*')) row.owner_id = 'owner-1';
      if (sql.includes('u.email')) row.email = 'persona@ucsm.edu.pe';
      return { rows: [row] };
    });
    const res = response();

    await getPublicationById({ params: { id: publicationId } }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ id: 'pub-1', title: 'Calculadora' });
    expect(res.body).not.toHaveProperty('email');
    expect(res.body).not.toHaveProperty('owner_id');
    expect(res.body.images).toEqual([{ image_url: 'https://example.test/foto.jpg', is_primary: true }]);
  });
});

describe('solicitudes rechazadas', () => {
  it('rechaza términos incompletos antes de abrir una transacción', async () => {
    const res = response();
    await createOperation({ user: { id: '11111111-1111-4111-8111-111111111111' },
      body: { publication_id: '00000000-0000-4000-8000-000000000001' } }, res);
    expect(res.statusCode).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.connect).not.toHaveBeenCalled();
  });

  it('oculta una publicación inexistente sin abrir una transacción', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const res = response();
    await createOperation({ user: { id: '11111111-1111-4111-8111-111111111111' },
      body: { publication_id: '00000000-0000-4000-8000-000000000001',
        requested_price: '25.00', requested_guarantee_amount: '0.00', requested_contract_version: 1 } }, res);
    expect(res.statusCode).toBe(404);
    expect(db.connect).not.toHaveBeenCalled();
  });
});
