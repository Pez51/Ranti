import { z } from 'zod';

const emailSyntax = z.email().max(255);

export function isUcsmInstitutionalEmail(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  if (!emailSyntax.safeParse(normalized).success) return false;
  const domain = normalized.split('@')[1];
  return domain === 'ucsm.edu.pe' || domain.endsWith('.ucsm.edu.pe');
}

// Adapters own transport and resolution. Services own account/challenge lifecycle.
export class IdentityProvider {
  async requestVerification(_email) { throw new Error('Identity provider not implemented.'); }
  async verifyChallenge(_challenge, _code) { throw new Error('Identity provider not implemented.'); }
  async resolveInstitutionalIdentity(_email) { throw new Error('Identity provider not implemented.'); }
}
