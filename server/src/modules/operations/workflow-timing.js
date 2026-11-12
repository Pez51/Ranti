import { AppError } from '../../shared/errors/app-error.js';

const hourMs = 60 * 60 * 1000;
const minuteMs = 60 * 1000;

function setting(name, fallback, maximum) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new AppError({ status: 503, code: 'WORKFLOW_CONFIGURATION', message: `Revisa la configuración de ${name}.`, details: null });
  }
  return value;
}

export function paymentDeadline(now, operation) {
  const limit = now.getTime() + setting('RANTI_PAYMENT_WINDOW_HOURS', 24, 720) * hourMs;
  const rentalStart = operation.start_date ? new Date(operation.start_date).getTime() : limit;
  return new Date(Math.min(limit, rentalStart));
}

export function paymentDeadlinePassed(operation, now) {
  return Boolean(operation.payment_expires_at && new Date(operation.payment_expires_at) <= now);
}

export const inspectionHours = () => setting('RANTI_RETURN_INSPECTION_HOURS', 72, 720);
export const overdueGraceHours = () => setting('RANTI_RETURN_GRACE_HOURS', 24, 720);
export const otpAttempts = () => setting('RANTI_DELIVERY_OTP_ATTEMPTS', 5, 5);
export const otpLifetimeMinutes = () => setting('RANTI_DELIVERY_OTP_MINUTES', 10, 60);

export function deliveryWindowEnd(meetingAt, endDate) {
  if (!meetingAt) return null;
  const end = new Date(meetingAt).getTime() + setting('RANTI_DELIVERY_WINDOW_HOURS', 2, 72) * hourMs;
  return new Date(Math.min(end, endDate ? new Date(endDate).getTime() : end));
}

export function otpExpiry(now, windowEnd) {
  return new Date(Math.min(windowEnd.getTime(), now.getTime() + otpLifetimeMinutes() * minuteMs));
}
