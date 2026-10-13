import pool from '../config/database.js';
import { photoMime } from '../modules/users/photo-storage.js';
import { publicationPhotoPattern, publicationPhotoStorage, publicationPhotoUrl, uploadPublicationPhoto } from '../modules/publications/publication-photo.js';

export async function upload(req, res, next) {
  try { res.status(201).json(await uploadPublicationPhoto(pool, req.user.id, req.body, req.get('content-type'))); }
  catch (error) { next(error); }
}
export async function read(req, res, next) {
  try {
    const id = req.params.photoId;
    if (!publicationPhotoPattern.test(publicationPhotoUrl(id))) return res.sendStatus(404);
    if (!(await pool.query('SELECT id FROM publication_photos WHERE id=$1', [id])).rowCount) return res.sendStatus(404);
    const bytes = await publicationPhotoStorage.read(id); const mime = photoMime(bytes);
    if (!mime) return res.sendStatus(404);
    res.set({ 'Content-Type': mime, 'Cross-Origin-Resource-Policy': 'cross-origin', 'Cache-Control': 'public, max-age=31536000, immutable' }).send(bytes);
  } catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
}
