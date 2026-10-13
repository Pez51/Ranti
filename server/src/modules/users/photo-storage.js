import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultDirectory = fileURLToPath(new URL('../../../uploads/profile/', import.meta.url));
const directory = path.resolve(process.env.RANTI_PHOTO_DIR || defaultDirectory);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function photoMime(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > 2 * 1024 * 1024) return null;
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function photoPath(id) {
  if (!uuid.test(id)) throw new Error('Identificador de foto inválido.');
  return path.join(directory, id);
}

// Local pilot adapter. A future object-storage adapter can keep the same three methods.
export const photoStorage = {
  async save(bytes) {
    const id = randomUUID();
    await mkdir(directory, { recursive: true });
    await writeFile(photoPath(id), bytes, { flag: 'wx' });
    return id;
  },
  async read(id) { return readFile(photoPath(id)); },
  async remove(id) {
    if (uuid.test(id)) await unlink(photoPath(id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  },
};
