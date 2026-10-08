import pool from '../../config/database.js';

export const createRequest = async (userId, data) => {
  return { message: 'Solicitud de cambio de rol enviada' };
};
export const listMyRequests = async (userId) => {
  return [];
};
export const listAllRequests = async () => {
  return [];
};
export const decideRequest = async (requestId, data) => {
  return { message: 'Solicitud evaluada por el administrador' };
};