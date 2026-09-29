import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { IdentityProvider, isUcsmInstitutionalEmail } from './identity-provider.js';

export class SimulatedIdentityProvider extends IdentityProvider {
  name = 'simulated';

  async requestVerification(email) {
    if (!isUcsmInstitutionalEmail(email)) throw new Error('Invalid institutional identity.');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    return { code, codeHash: await bcrypt.hash(code, 10), expiresAt: new Date(Date.now() + 600000) };
  }

  async verifyChallenge(challenge, code) {
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) || !challenge.code_hash) return false;
    return bcrypt.compare(code, challenge.code_hash);
  }

  async resolveInstitutionalIdentity(email) {
    if (!isUcsmInstitutionalEmail(email)) throw new Error('Invalid institutional identity.');
    return { email: email.trim().toLowerCase(), provider: this.name };
  }
}
