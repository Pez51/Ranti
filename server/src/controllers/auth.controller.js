import * as identityService from '../modules/identity/identity.service.js';

export const register = async (req, res, next) => {
  try {
    const result = await identityService.registerUser(req.body);
    res.status(201).json({ message: 'Usuario registrado exitosamente', ...result });
  } catch (error) {
    next(error); 
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await identityService.loginUser(req.body);
    res.status(200).json({ message: 'Bienvenido :D', ...result });
  } catch (error) {
    next(error);
  }
};

// --- NUEVAS FUNCIONES AGREGADAS ---

export const confirm = async (req, res, next) => {
  try {
    // Le pasamos req.body o req.query dependiendo de cómo el frontend envíe el token/código
    const result = await identityService.confirmUser(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export const resend = async (req, res, next) => {
  try {
    const result = await identityService.resendVerification(req.body);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};