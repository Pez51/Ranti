import * as operationService from '../services/operation.service.js';

export const createOperationHandler = async (req, res) => {
  try {
    const { publicationId, startDate, endDate } = req.body;
    // req.user.id viene del middleware de autenticación JWT
    const demandanteId = req.user.id; 

    const result = await operationService.createOperation(
      demandanteId, 
      publicationId, 
      startDate, 
      endDate
    );

    res.status(201).json({
      message: 'Operación y reserva creadas exitosamente',
      data: result
    });
  } catch (error) {
    res.status(409).json({
      error: error.message
    });
  }
};