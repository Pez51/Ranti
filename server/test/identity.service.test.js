import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { loadEnv } from '../src/config/env.js';

// Dynamic imports let the first RED report missing behavior as assertions.
const boundary = await import('../src/modules/identity/identity-provider.js').catch(() => ({}));
const simulated = await import('../src/modules/identity/simulated-identity-provider.js').catch(() => ({}));
const service = await import('../src/modules/identity/identity.service.js').catch(() => ({}));

describe('institutional identity boundary', () => {
  it.each(['person@ucsm.edu.pe', 'person@estudiante.ucsm.edu.pe', ' Person@FACULTAD.UCSM.EDU.PE '])('accepts %s', email => {
    expect(boundary.isUcsmInstitutionalEmail).toBeTypeOf('function');
    expect(boundary.isUcsmInstitutionalEmail(email)).toBe(true);
  });
  it.each(['person@gmail.com', 'person@ucsm.edu.pe.other.com', 'person@evilucsm.edu.pe', 'person@ucsm.edu.pe.',
    'person@@ucsm.edu.pe', 'a b@ucsm.edu.pe', 'a..b@ucsm.edu.pe', '@ucsm.edu.pe', 'a@-bad.ucsm.edu.pe',
    'a@ucsm.edu.pе', '', null, {}, 'a@ucsm.edu.pe\nother'])('rejects %j', email => {
    expect(boundary.isUcsmInstitutionalEmail).toBeTypeOf('function');
    expect(boundary.isUcsmInstitutionalEmail(email)).toBe(false);
  });
  it('implements the provider contract with a random six-digit bcrypt challenge and ten-minute expiry', async () => {
    expect(simulated.SimulatedIdentityProvider).toBeTypeOf('function');
    const provider = new simulated.SimulatedIdentityProvider();
    expect(provider).toBeInstanceOf(boundary.IdentityProvider);
    const start = Date.now();
    const challenge = await provider.requestVerification(' Person@UCSM.EDU.PE ');
    expect(challenge.code).toMatch(/^\d{6}$/);
    expect(challenge.codeHash).not.toBe(challenge.code);
    expect(await bcrypt.compare(challenge.code, challenge.codeHash)).toBe(true);
    expect(challenge.expiresAt.getTime()).toBeGreaterThanOrEqual(start + 600000);
    expect(challenge.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 600000);
    expect(await provider.verifyChallenge({ code_hash: challenge.codeHash }, challenge.code)).toBe(true);
    expect(await provider.verifyChallenge({ code_hash: challenge.codeHash }, 'bad')).toBe(false);
    expect(await provider.resolveInstitutionalIdentity(' Person@UCSM.EDU.PE '))
      .toEqual({ email: 'person@ucsm.edu.pe', provider: 'simulated' });
    await expect(provider.requestVerification('person@gmail.com')).rejects.toThrow();
  });
  it.each([
    { acceptTerms: false }, { acceptTerms: undefined }, { termsVersion: '' }, { termsVersion: ' '.repeat(2) },
    { termsVersion: 'v'.repeat(101) }, { password: 'short' }, { password: 'p'.repeat(73) },
    { password: 'é'.repeat(40) }, { email: 'person@gmail.com' },
  ])('validates before touching the database: %j', async override => {
    expect(service.registerPendingAccount).toBeTypeOf('function');
    await expect(service.registerPendingAccount({}, {}, {
      email: 'person@ucsm.edu.pe', password: 'secret-password', acceptTerms: true, termsVersion: '2026-09', ...override,
    })).rejects.toMatchObject({ code: 'IDENTITY_INVALID_INPUT', status: 400 });
  });
  it('validates provider settings and defaults simulator disclosure off', () => {
    const base = { NODE_ENV: 'test', DATABASE_URL: 'postgres://localhost/db', JWT_SECRET: 'test' };
    expect(loadEnv(base)).toMatchObject({ IDENTITY_PROVIDER: 'simulated', IDENTITY_SIMULATOR_EXPOSE_CODE: false });
    expect(loadEnv({ ...base, IDENTITY_SIMULATOR_EXPOSE_CODE: 'true' }).IDENTITY_SIMULATOR_EXPOSE_CODE).toBe(true);
    expect(loadEnv({ ...base, IDENTITY_SIMULATOR_EXPOSE_CODE: 'false' }).IDENTITY_SIMULATOR_EXPOSE_CODE).toBe(false);
    expect(() => loadEnv({ ...base, IDENTITY_PROVIDER: 'unknown' })).toThrow(/IDENTITY_PROVIDER/);
    expect(() => loadEnv({ ...base, IDENTITY_SIMULATOR_EXPOSE_CODE: 'yes' })).toThrow(/IDENTITY_SIMULATOR_EXPOSE_CODE/);
  });
});
