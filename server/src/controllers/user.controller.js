import pool from '../config/database.js';
import { AppError } from '../shared/errors/app-error.js';
import { getOwnProfile, updateOwnProfile } from '../modules/users/profile.service.js';
import { requestStudentRole, listOwnRoleRequests, listPendingRoleRequests, decideStudentRole } from '../modules/users/role-review.service.js';

const handle = work => async (req, res, next) => {
  try { await work(req, res); } catch (error) { next(error); }
};

export const getMe = handle(async (req, res) => {
  res.json(await getOwnProfile(pool, req.user.id));
});

export const patchMe = handle(async (req, res) => {
  res.json(await updateOwnProfile(pool, req.user.id, req.body));
});

export const createRoleRequest = handle(async (req, res) => {
  if (req.body && ('userId' in req.body || 'user_id' in req.body)) {
    throw new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
  }
  const result = await requestStudentRole(pool, { ...req.body, userId: req.user.id });
  res.status(201).json(result);
});

export const listMyRoleRequests = handle(async (req, res) => {
  res.json(await listOwnRoleRequests(pool, req.user.id));
});

function page(req) {
  if (Object.keys(req.query).some(key => !['limit', 'offset'].includes(key))) {
    throw new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
  }
  const parse = key => {
    if (req.query[key] === undefined) return undefined;
    if (typeof req.query[key] !== 'string' || !/^\d+$/.test(req.query[key])) {
      throw new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
    }
    return Number(req.query[key]);
  };
  return { adminId: req.user.id, limit: parse('limit'), offset: parse('offset') };
}

export const listRoleRequests = handle(async (req, res) => {
  res.json(await listPendingRoleRequests(pool, page(req)));
});

export const decideRoleRequest = handle(async (req, res) => {
  if (req.body && ('adminId' in req.body || 'requestId' in req.body)) {
    throw new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
  }
  res.json(await decideStudentRole(pool, { ...req.body, adminId: req.user.id, requestId: req.params.id }));
});
