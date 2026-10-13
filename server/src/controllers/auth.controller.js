import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../config/database.js';
import { env } from '../config/env.js';
import { isUcsmInstitutionalEmail } from '../modules/identity/identity-provider.js';
import { passwordInput } from '../modules/identity/password-input.js';
import { SimulatedIdentityProvider } from '../modules/identity/simulated-identity-provider.js';
import { IdentityError, registerPendingAccount, resendVerification, verifyPendingAccount } from '../modules/identity/identity.service.js';

const provider = new SimulatedIdentityProvider();
const loginInput = z.object({
  email: z.string().trim().toLowerCase().refine(isUcsmInstitutionalEmail),
  password: passwordInput,
});
const signToken = user => jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: '24h' });
// Equal-cost password comparison for an absent account, without logging credentials.
const absentPasswordHash = bcrypt.hashSync('unusable-login-placeholder', 10);
const respondError = (res, error) => {
  if (error instanceof IdentityError) return res.status(error.status).json({ error: error.message,
    code: error.code, ...(error.retryable ? { retryable: true } : {}) });
  return res.status(500).json({ error: 'Error interno del servidor.' });
};

export const register = async (req, res) => {
  try {
    const result = await registerPendingAccount(pool, provider, req.body);
    return res.status(result.retryable ? 202 : 201).json(result);
  } catch (error) { return respondError(res, error); }
};

export const resend = async (req, res) => {
  try {
    const result = await resendVerification(pool, provider, req.body);
    return res.status(result.retryable ? 202 : 200).json(result);
  } catch (error) { return respondError(res, error); }
};

export const confirm = async (req, res) => {
  try {
    const { user } = await verifyPendingAccount(pool, provider, req.body);
    return res.status(200).json({ message: 'Cuenta verificada exitosamente', token: signToken(user), user });
  } catch (error) { return respondError(res, error); }
};

export const login = async (req, res) => {
  const parsed = loginInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Ingresa un correo institucional y una contraseña válidos.' });
  const { email, password } = parsed.data;
  try {
    const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
    const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? absentPasswordHash);
    if (!passwordMatches || !user || user.status !== 'Activa' || user.verification_status !== 'Verificado') {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }
    return res.status(200).json({ message: 'Bienvenido :D', token: signToken(user), user: {
      id: user.id, email: user.email, role: user.role, status: user.status,
      verification_status: user.verification_status, reputation: user.reputation_score,
    } });
  } catch (error) { return respondError(res, error); }
};
