import { describe, expect, it } from 'vitest';
import { registerPendingAccount } from '../src/modules/identity/identity.service.js';
import { isUcsmInstitutionalEmail, roleFromInstitutionalEmail } from '../src/modules/identity/identity-provider.js';
import { photoMime, photoStorage } from '../src/modules/users/photo-storage.js';
import { updateOwnProfile } from '../src/modules/users/profile.service.js';

describe('institutional role selection', () => {
  it.each([
    ['alumna@estudiante.ucsm.edu.pe', 'Estudiante'],
    ['EGRESADA@UCSM.EDU.PE', 'Egresado'],
  ])('derives %s from the exact mailbox domain', (email, role) => {
    expect(isUcsmInstitutionalEmail(email)).toBe(true);
    expect(roleFromInstitutionalEmail(email)).toBe(role);
  });

  it.each(['x@facultad.ucsm.edu.pe', 'x@ucsm.edu.pe.evil.test', 'x@estudianteucsm.edu.pe', 'x@gmail.com'])(
    'rejects an unsupported domain: %s', email => {
      expect(isUcsmInstitutionalEmail(email)).toBe(false);
      expect(roleFromInstitutionalEmail(email)).toBeNull();
    });

  it.each([
    ['alumna@estudiante.ucsm.edu.pe', 'Estudiante'],
    ['egresada@ucsm.edu.pe', 'Egresado'],
  ])('persists %s as a pending %s without trusting the caller role', async (email, role) => {
    let insertArguments, insertSql;
    const user = { id: 'user-id', email, role, status: 'Pendiente de verificación',
      verification_status: 'No verificado', terms_accepted_at: new Date(), terms_version: 'pilot-v1' };
    const client = {
      query: async sql => {
        if (sql.includes('SELECT * FROM users')) return { rows: [user] };
        if (sql.includes('INSERT INTO identity_challenges')) return { rows: [{ id: 'challenge-id', expires_at: new Date() }] };
        return { rows: [] };
      },
      release() {},
    };
    const db = {
      query: async (sql, args) => { insertSql = sql; insertArguments = args; return { rows: [] }; },
      connect: async () => client,
    };
    const provider = { name: 'simulated', requestVerification: async () => ({ code: '123456', codeHash: 'hash', expiresAt: new Date() }) };
    const result = await registerPendingAccount(db, provider,
      { email, password: 'securepass', acceptTerms: true, termsVersion: 'pilot-v1', role: 'Administrador' });
    expect(insertArguments[2]).toBe(role);
    expect(insertArguments[3]).toBe(role);
    expect(insertArguments[4]).toBe('pilot-v1');
    expect(insertSql).toContain('VALUES ($1, $2, $3, $4,');
    expect(result.user).toMatchObject({ role, status: 'Pendiente de verificación' });
    expect(result).not.toHaveProperty('token');
  });
});

describe('profile photo input', () => {
  it('recognizes only bounded JPEG, PNG and WebP file signatures', () => {
    expect(photoMime(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))).toBe('image/jpeg');
    expect(photoMime(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1]))).toBe('image/png');
    expect(photoMime(Buffer.from('RIFFxxxxWEBP'))).toBe('image/webp');
    expect(photoMime(Buffer.from('<svg></svg>'))).toBeNull();
    expect(photoMime(Buffer.alloc(2 * 1024 * 1024 + 1))).toBeNull();
  });

  it('does not allow a client-supplied avatar URL or role through profile PATCH', async () => {
    const db = { query: () => { throw new Error('should not query'); } };
    for (const patch of [{ avatar_url: 'https://example.org/photo.png' }, { role: 'Administrador' }]) {
      await expect(updateOwnProfile(db, 'user-id', patch)).rejects.toMatchObject({ status: 400 });
    }
  });

  it('round-trips a photo through the local storage adapter', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const id = await photoStorage.save(bytes);
    try { expect(await photoStorage.read(id)).toEqual(bytes); }
    finally { await photoStorage.remove(id); }
    await expect(photoStorage.read(id)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
