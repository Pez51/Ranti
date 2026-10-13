import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { photoMime } from '../users/photo-storage.js';
import { AppError } from '../../shared/errors/app-error.js';
import { requireCurrentUser } from '../users/profile.service.js';

const directory = path.resolve(process.env.RANTI_PUBLICATION_PHOTO_DIR || fileURLToPath(new URL('../../../uploads/publications/', import.meta.url)));
export const publicationPhotoPattern = /^\/api\/publications\/photos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const publicationPhotoUrl = id => `/api/publications/photos/${id}`;
export function publicationImageReference(value) {
  if (typeof value !== 'string') return false;
  if (publicationPhotoPattern.test(value)) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/[\s\\]/.test(value); }
  catch { return false; }
}
// Local pilot adapter: random keys only, independent of user filenames.
export const publicationPhotoStorage = {
  async save(bytes, id) { await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, id), bytes, { flag: 'wx' }); },
  async read(id) { return readFile(path.join(directory, id)); },
  async remove(id) { await unlink(path.join(directory, id)).catch(e => { if (e.code !== 'ENOENT') throw e; }); },
};
export async function uploadPublicationPhoto(db, ownerId, bytes, contentType) {
  const mime = photoMime(bytes);
  if (!mime || mime !== contentType?.split(';')[0]) throw new AppError({ status: 400, code: 'INVALID_PHOTO', message: 'Sube una foto JPEG, PNG o WebP de hasta 2 MB.' });
  const client = await db.connect(); const id = randomUUID(); let saved = false;
  try {
    await client.query('BEGIN');
    requireCurrentUser((await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [ownerId])).rows[0]);
    const pending = await client.query(`SELECT count(*)::int AS total FROM publication_photos ph WHERE owner_id=$1
      AND NOT EXISTS (SELECT 1 FROM publication_images WHERE image_url='/api/publications/photos/' || ph.id::text)`, [ownerId]);
    if (pending.rows[0].total >= 60) throw new AppError({ status: 429, code: 'PHOTO_QUOTA', message: 'Tienes demasiadas fotos sin asociar. Guarda las publicaciones antes de subir más.' });
    await publicationPhotoStorage.save(bytes, id); saved = true;
    await client.query('INSERT INTO publication_photos (id,owner_id,mime) VALUES ($1,$2,$3)', [id, ownerId, mime]);
    await client.query('COMMIT'); return { url: publicationPhotoUrl(id) };
  } catch (e) {
    await client.query('ROLLBACK'); if (saved) await publicationPhotoStorage.remove(id); throw e;
  } finally { client.release(); }
}
