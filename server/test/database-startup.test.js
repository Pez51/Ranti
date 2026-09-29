import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock('pg', () => ({
  default: {
    Pool: class {
      connect = connection.connect;
      on() {}
    },
  },
}));

import { testConnection } from '../src/config/database.js';

beforeEach(() => {
  connection.connect.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe('conexión obligatoria al iniciar', () => {
  it('propaga el fallo de PostgreSQL para impedir que el servidor escuche', async () => {
    connection.connect.mockRejectedValue(new Error('PostgreSQL no disponible'));

    await expect(testConnection()).rejects.toThrow('PostgreSQL no disponible');
  });

  it('libera la conexión de prueba cuando PostgreSQL responde', async () => {
    const client = { release: vi.fn() };
    connection.connect.mockResolvedValue(client);

    await testConnection();

    expect(client.release).toHaveBeenCalledOnce();
  });
});
