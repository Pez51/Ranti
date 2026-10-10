import * as profileService from '../modules/users/profile.service.js';
import * as roleReviewService from '../modules/users/role-review.service.js';
import pool from '../config/database.js';

export const getMe = async (req, res, next) => {
  try { res.status(200).json(await profileService.getProfile(req.user.id)); } catch (e) { next(e); }
};
export const patchMe = async (req, res, next) => {
  try { res.status(200).json(await profileService.updateProfile(req.user.id, req.body)); } catch (e) { next(e); }
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