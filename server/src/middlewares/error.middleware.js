// 1. El atrapador de rutas inexistentes (404)
export const notFound = (req, res, next) => {
  const error = new Error(`No se encontró la ruta: ${req.originalUrl}`);
  error.status = 404;
  error.code = 'ROUTE_NOT_FOUND';
  next(error); // Pasa el error al errorHandler
};

// 2. El interceptor global de errores
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.status || 500;
  let message = err.message || 'Error interno del servidor';
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let details = err.details || null;

  // Interceptar Errores Nativos de PostgreSQL
  if (err.code === '23505') { 
    statusCode = 409;
    message = 'El registro ya existe en el sistema.';
    code = 'DB_DUPLICATE_KEY';
  } else if (err.code === '22P02') {
    statusCode = 400;
    message = 'Formato de dato inválido para la base de datos.';
    code = 'DB_INVALID_TEXT_REPRESENTATION';
  }

  // Interceptar Errores de Autenticación (JWT)
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Firma de token inválida o alterada. Inicia sesión nuevamente.';
    code = 'AUTH_INVALID_TOKEN';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Tu sesión ha expirado por seguridad. Inicia sesión nuevamente.';
    code = 'AUTH_EXPIRED_TOKEN';
  }

  // Modo Seguridad en Producción
  if (statusCode === 500 && process.env.NODE_ENV === 'production') {
    message = 'Algo salió mal en el servidor. Nuestro equipo ha sido notificado.';
  }

  // Enviar respuesta estructurada
  res.status(statusCode).json({
    success: false,
    code,
    message,
    ...(details && { details }),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }) 
  });
};