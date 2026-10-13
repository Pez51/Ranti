import { AppError } from '../../shared/errors/app-error.js';

const disabled = () => new AppError({ status: 410, code: 'ROLE_REQUEST_DISABLED',
  message: 'El rol se determina por el dominio del correo institucional verificado.' });

export const createRequest = async () => {
  throw disabled();
};
export const listMyRequests = async (userId) => {
  throw disabled();
};
export const listAllRequests = async () => {
  throw disabled();
};
export const decideRequest = async () => {
  throw disabled();
};
