import { AppError } from '../shared/errors/app-error.js';

export const validateSchema = (schema) => (req, res, next) => {
  try {
    // Intenta validar el req.body contra el esquema de Zod
    schema.parse(req.body);
    next(); // Si todo es correcto, pasa al controlador
  } catch (error) {
    // Si falla, Zod devuelve un arreglo de errores. Los extraemos y formateamos.
    const errorMessages = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`).join(' | ');
    
    next(new AppError({ 
      status: 400, 
      message: `Error de validación de datos: ${errorMessages}` 
    }));
  }
};