import { AppError } from '../../shared/errors/app-error.js';

const invalid = () => new AppError({ status: 422, code: 'PUBLICATION_INVALID', message: 'La publicación no cumple los requisitos.' });
export const modalities = ['Venta', 'Alquiler', 'Préstamo'];

// NUMERIC(10,2): reject fractions PostgreSQL would round across a policy boundary.
export function money(value) {
  if (!['string', 'number'].includes(typeof value)) throw invalid();
  const text = String(value);
  if (text.length > 32 || !/^\d+(?:\.\d{1,2})?$/.test(text)) throw invalid();
  const [whole, fraction = ''] = text.split('.');
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents > 9999999999n) throw invalid();
  return { cents, text: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` };
}

export function dateValue(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) throw invalid();
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  // The existing reservation API interprets date-only input at Peru midnight.
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00-05:00` : value);
  if (year < 1 || !Number.isFinite(parsed.getTime()) || calendar.getUTCFullYear() !== year ||
      calendar.getUTCMonth() + 1 !== month || calendar.getUTCDate() !== day ||
      (value.length > 10 && (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59))) throw invalid();
  return parsed;
}

export function evaluatePublicationRisk(input) {
  if (!input || !modalities.includes(input.modality) || (input.currency !== undefined && input.currency !== 'PEN')) throw invalid();
  const price = money(input.price ?? 0); const guarantee = money(input.guaranteeAmount ?? 0);
  if (input.modality === 'Préstamo' ? price.cents !== 0n : price.cents <= 0n) throw invalid();
  if (input.modality === 'Venta') {
    if (guarantee.cents !== 0n || input.availableFrom != null || input.availableUntil != null) throw invalid();
  } else {
    if (input.availableFrom == null || input.availableUntil == null ||
        dateValue(input.availableFrom) >= dateValue(input.availableUntil)) throw invalid();
  }
  const exposure = price.cents >= guarantee.cents ? price : guarantee;
  const level = exposure.cents >= 100000n ? 3 : exposure.cents >= 50000n ? 2 : 1;
  return { policyVersion: 'pilot-v1', level, requiresAdminReview: level > 1,
    requiresProvenanceEvidence: level === 3, declaredExposure: exposure.text };
}
