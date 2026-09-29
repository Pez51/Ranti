import { z } from 'zod';

const emailSyntax = z.email();
const hostnameLabel = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function isUcsmInstitutionalEmail(email) {
  if (typeof email !== 'string') return false;
  const normalized = email.trim().toLowerCase();
  // SMTP mailbox limit excludes the surrounding path brackets. Zod's syntax
  // check alone does not enforce octet limits or DNS label boundaries.
  if (Buffer.byteLength(normalized, 'utf8') > 254) return false;
  if (!emailSyntax.safeParse(normalized).success) return false;
  const [local, domain] = normalized.split('@');
  const localBytes = Buffer.byteLength(local, 'utf8');
  if (localBytes < 1 || localBytes > 64) return false;
  if (!domain.split('.').every(label => label.length >= 1 && label.length <= 63 && hostnameLabel.test(label))) return false;
  return domain === 'ucsm.edu.pe' || domain.endsWith('.ucsm.edu.pe');
}

// Adapters own transport and resolution. Services own account/challenge lifecycle.
export class IdentityProvider {
  async requestVerification(_email) { throw new Error('Identity provider not implemented.'); }
  async verifyChallenge(_challenge, _code) { throw new Error('Identity provider not implemented.'); }
  async resolveInstitutionalIdentity(_email) { throw new Error('Identity provider not implemented.'); }
}
