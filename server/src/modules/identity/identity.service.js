import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as identityRepository from './identity.repository.js';
import { AppError } from '../../shared/errors/app-error.js';

export const registerUser = async (userData) => {
  const { email, password, role = 'Estudiante', academic_condition } = userData;

  const existingUser = await identityRepository.findByEmail(email);
  if (existingUser) {
    throw new AppError({ 
      status: 409, 
      message: 'El correo ya está registrado.' 
    });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const newUser = await identityRepository.createUser({
    email, 
    passwordHash, 
    role, 
    academic_condition
  });

  const token = jwt.sign(
    { id: newUser.id, role: newUser.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user: newUser };
};

export const loginUser = async (credentials) => {
  const { email, password } = credentials;

  const user = await identityRepository.findByEmail(email);
  if (!user) {
    throw new AppError({ status: 401, message: 'Credenciales inválidas.' });
  }

  if (user.status === 'Suspendida') {
    throw new AppError({ 
      status: 403, 
      message: 'Tu cuenta ha sido suspendida por la administración.' 
    });
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);
  if (!isValidPassword) {
    throw new AppError({ status: 401, message: 'Credenciales inválidas.' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return {
    token,
    user: { 
      id: user.id, 
      email: user.email, 
      role: user.role, 
      reputation: user.reputation_score 
    }
  };
};

export const confirmUser = async (data) => {
  const { email, code } = data; 

  const user = await identityRepository.findByEmail(email);
  if (!user) {
    throw new AppError({ status: 404, message: 'Usuario no encontrado.' });
  }

  if (user.status === 'Activa') {
    return { message: 'La cuenta ya se encuentra verificada y activa.' };
  }

  await identityRepository.updateUserStatus(email, 'Activa');

  return { message: 'Cuenta confirmada exitosamente. Ya puedes iniciar sesión.' };
};

export const resendVerification = async (data) => {
  const { email } = data;

  const user = await identityRepository.findByEmail(email);
  if (!user) {
    throw new AppError({ status: 404, message: 'Usuario no encontrado.' });
  }

  if (user.status === 'Activa') {
    return { message: 'Esta cuenta ya está activa, no requiere verificación.' };
  }
  
  return { message: 'Se ha reenviado el código de verificación a tu correo institucional.' };
};