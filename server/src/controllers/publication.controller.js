import * as publicationService from '../modules/publications/publication.service.js';

export const getPublications = async (req, res, next) => {
  try { res.status(200).json(await publicationService.getPublications(req.query)); } catch (e) { next(e); }
};
export const listOwnPublications = async (req, res, next) => {
  try { res.status(200).json(await publicationService.listOwnPublications(req.user.id)); } catch (e) { next(e); }
};
export const getPublicationById = async (req, res, next) => {
  try { res.status(200).json(await publicationService.getPublicationById(req.params.id)); } catch (e) { next(e); }
};
export const createPublication = async (req, res, next) => {
  try { res.status(201).json(await publicationService.createPublication(req.body, req.user.id)); } catch (e) { next(e); }
};
export const updatePublication = async (req, res, next) => {
  try { res.status(200).json(await publicationService.updatePublication(req.params.id, req.body, req.user.id)); } catch (e) { next(e); }
};
export const submitPublication = async (req, res, next) => {
  try { res.status(200).json(await publicationService.changeStatus(req.params.id, req.user.id, 'En Revisión')); } catch (e) { next(e); }
};
export const pausePublication = async (req, res, next) => {
  try { res.status(200).json(await publicationService.changeStatus(req.params.id, req.user.id, 'Pausada')); } catch (e) { next(e); }
};
export const reactivatePublication = async (req, res, next) => {
  try { res.status(200).json(await publicationService.changeStatus(req.params.id, req.user.id, 'Activa')); } catch (e) { next(e); }
};
export const withdrawPublication = async (req, res, next) => {
  try { res.status(200).json(await publicationService.changeStatus(req.params.id, req.user.id, 'Retirada')); } catch (e) { next(e); }
};

// Rutas de Admin
export const listPendingPublicationReviews = async (req, res, next) => {
  try { res.status(200).json(await publicationService.listPendingReviews()); } catch (e) { next(e); }
};
export const decidePublicationReview = async (req, res, next) => {
  try { res.status(200).json(await publicationService.decideReview(req.params.id, req.body)); } catch (e) { next(e); }
};