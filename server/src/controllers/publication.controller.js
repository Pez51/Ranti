import pool from '../config/database.js';
import { AppError } from '../shared/errors/app-error.js';
import * as publications from '../modules/publications/publication.service.js';

// Preserve the existing publication API's string error shape.
const handle = work => async (req, res) => {
  try { await work(req, res); } catch (error) {
    res.status(error instanceof AppError ? error.status : 500).json({
      error: error instanceof AppError ? error.message : 'Error interno del servidor.' });
  }
};
export const getPublications = handle(async (req, res) => res.json(await publications.listPublications(pool, req.query)));
export const getPublicationById = handle(async (req, res) => res.json(await publications.getPublicPublication(pool, req.params.id)));
export const createPublication = handle(async (req, res) => res.status(201).json({
  message: 'Publicación creada exitosamente', publication: await publications.createPublication(pool, req.user.id, req.body) }));
export const updatePublication = handle(async (req, res) => res.json(await publications.updatePublication(pool, req.user.id, req.params.id, req.body)));
export const listOwnPublications = handle(async (req, res) => res.json(await publications.listOwnPublications(pool, req.user.id)));
const lifecycle = action => handle(async (req, res) => {
  if (req.body && Object.keys(req.body).length) throw new AppError({ status: 400, code: 'INVALID_INPUT', message: 'Datos inválidos.' });
  res.json(await publications[action](pool, req.user.id, req.params.id));
});
export const submitPublication = lifecycle('submitPublication');
export const pausePublication = lifecycle('pausePublication');
export const reactivatePublication = lifecycle('reactivatePublication');
export const withdrawPublication = lifecycle('withdrawPublication');
export const listPendingPublicationReviews = handle(async (req, res) => res.json(await publications.listPendingPublicationReviews(pool, req.user.id, req.query)));
export const decidePublicationReview = handle(async (req, res) => res.json(await publications.decidePublicationReview(pool, req.user.id, req.params.id, req.body)));
