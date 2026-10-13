import * as profileService from '../modules/users/profile.service.js';
import * as roleReviewService from '../modules/users/role-review.service.js';
import pool from '../config/database.js';
import { AppError } from '../shared/errors/app-error.js';
import { photoMime, photoStorage } from '../modules/users/photo-storage.js';

const photoUrl = (userId, photoId) => `/api/users/photos/${userId}/${photoId}`;
const photoIdFromUrl = url => /^\/api\/users\/photos\/[0-9a-f-]{36}\/([0-9a-f-]{36})$/i.exec(url || '')?.[1];

export const getMe = async (req, res, next) => {
  try { res.status(200).json(await profileService.getOwnProfile(pool, req.user.id)); } catch (e) { next(e); }
};
export const getMemberProfile=async(req,res,next)=>{
  try{res.set('Cache-Control','private, no-store').json(await profileService.getMemberProfile(pool,req.params.id));}catch(error){next(error);}
};
export const patchMe = async (req, res, next) => {
  try { res.status(200).json(await profileService.updateOwnProfile(pool, req.user.id, req.body)); } catch (e) { next(e); }
};

export const putMyPhoto = async (req, res, next) => {
  try {
    const mime = photoMime(req.body);
    if (!mime || req.get('content-type')?.split(';')[0] !== mime) {
      throw new AppError({ status: 400, code: 'INVALID_PHOTO', message: 'Sube una foto JPEG, PNG o WebP de hasta 2 MB.' });
    }
    const previous = await profileService.getOwnProfile(pool, req.user.id);
    const photoId = await photoStorage.save(req.body);
    let updated;
    try { updated = await profileService.setOwnPhoto(pool, req.user.id, photoUrl(req.user.id, photoId)); }
    catch (error) { await photoStorage.remove(photoId); throw error; }
    const previousId = photoIdFromUrl(previous.avatar_url);
    if (previousId) await photoStorage.remove(previousId).catch(() => {});
    res.status(200).json(updated);
  } catch (error) { next(error); }
};

export const getPhoto = async (req, res, next) => {
  try {
    const { userId, photoId } = req.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) return res.sendStatus(404);
    const expected = photoUrl(userId, photoId);
    const user = (await pool.query('SELECT avatar_url FROM users WHERE id = $1', [userId])).rows[0];
    if (!user || user.avatar_url !== expected) return res.sendStatus(404);
    const bytes = await photoStorage.read(photoId);
    const mime = photoMime(bytes);
    if (!mime) return res.sendStatus(404);
    res.set('Content-Type', mime);
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(bytes);
  } catch (error) { if (error.code === 'ENOENT') return res.sendStatus(404); next(error); }
};

export const createRoleRequest = async (req, res, next) => {
  try { res.status(201).json(await roleReviewService.createRequest(req.user.id, req.body)); } catch (e) { next(e); }
};
export const listMyRoleRequests = async (req, res, next) => {
  try { res.status(200).json(await roleReviewService.listMyRequests(req.user.id)); } catch (e) { next(e); }
};
export const listRoleRequests = async (req, res, next) => {
  try { res.status(200).json(await roleReviewService.listAllRequests()); } catch (e) { next(e); }
};
export const decideRoleRequest = async (req, res, next) => {
  try { res.status(200).json(await roleReviewService.decideRequest(req.params.id, req.body)); } catch (e) { next(e); }
};
