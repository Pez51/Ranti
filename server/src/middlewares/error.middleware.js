import { AppError } from '../shared/errors/app-error.js';

export function notFound(req, res, next) {
  next(new AppError({ status: 404, code: 'NOT_FOUND', message: 'Ruta no encontrada.' }));
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const publicError = error instanceof AppError
    ? error
    : error?.type === 'entity.parse.failed'
      ? new AppError({ status: 400, code: 'INVALID_JSON', message: 'JSON inválido.' })
      : new AppError({ status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor.' });

  res.status(publicError.status).json({
    error: {
      code: publicError.code,
      message: publicError.message,
      ...(publicError.details === undefined ? {} : { details: publicError.details }),
      request_id: req.requestId,
    },
  });
}
