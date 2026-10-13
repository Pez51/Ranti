import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getOwnProfile, updateOwnProfile, setOwnPhoto } from '../src/modules/users/profile.service.js';
import { academicCatalog, isAcademicSelection } from '../src/modules/users/academic-catalog.js';
import { createRequest, listMyRequests, listAllRequests, decideRequest } from '../src/modules/users/role-review.service.js';

const userId = randomUUID();
const active = {
  id: userId, email: 'owner@ucsm.edu.pe', role: 'Egresado', status: 'Activa',
  verification_status: 'Verificado', display_name: 'Ana', contact_number: null,
  avatar_url: null, faculty: null, career: null, reputation_score: '4.25', operations_count: 7,
  created_at: new Date('2026-01-01T00:00:00Z'),
};
function dbForUser(user = active) {
  const queries = [];
  return {
    queries,
    db: { query: async (sql, args) => {
      queries.push({ sql, args });
      if (sql.includes('FROM users')) return { rows: user ? [user] : [] };
      if (sql.includes('UPDATE users')) return { rows: [{ ...user, avatar_url: sql.includes('avatar_url') ? args[1] : user.avatar_url }] };
      return { rows: [] };
    } },
  };
}

describe('profile under verified account', () => {
  it('projects public fields and derives academic condition from the role', async () => {
    const { db } = dbForUser();
    expect(await getOwnProfile(db, userId)).toMatchObject({
      id: userId, email: active.email, role: 'Egresado', academic_condition: 'Egresado',
      university: 'Universidad Católica de Santa María', contact_number: null,
      avatar_url: null, reputation_score: '4.25', operations_count: 7,
    });
  });

  it.each(['email', 'role', 'academic_condition', 'avatar_url', 'reputation_score',
    'verification_status', 'status', 'identity_provider', 'unknown'])(
    'rejects client edit of protected field %s before SQL', async field => {
      const { db, queries } = dbForUser();
      await expect(updateOwnProfile(db, userId, { [field]: 'untrusted' })).rejects.toMatchObject({ status: 400 });
      expect(queries).toHaveLength(0);
    });

  it('accepts a faculty and career from the same official catalog entry', async () => {
    const { db, queries } = dbForUser();
    await updateOwnProfile(db, userId, { display_name: '  María  ', contact_number: null,
      faculty: '  Ciencias e Ingenierías Físicas y Formales  ', career: ' Ingeniería de Sistemas ' });
    const update = queries.find(({ sql }) => sql.includes('UPDATE users'));
    expect(update.args).toEqual([userId, 'María', null,
      'Ciencias e Ingenierías Físicas y Formales', 'Ingeniería de Sistemas']);
  });

  it.each([
    { faculty: 'Ingeniería', career: 'Ingeniería de Sistemas' },
    { faculty: 'Ciencias Sociales y Humanidades', career: 'Ingeniería de Sistemas' },
    { faculty: 'Ciencias e Ingenierías Físicas y Formales', career: null },
    { faculty: null, career: null },
  ])('rejects unselected or mismatched academic values: %j', async patch => {
    const { db, queries } = dbForUser();
    await expect(updateOwnProfile(db, userId, patch)).rejects.toMatchObject({
      status: 400, code: 'INVALID_ACADEMIC_SELECTION',
    });
    expect(queries.some(({ sql }) => sql.includes('UPDATE users'))).toBe(false);
  });

  it('allows a non-academic staff profile to leave both fields empty', async () => {
    const { db, queries } = dbForUser({ ...active, role: 'Administrador' });
    await updateOwnProfile(db, userId, { faculty: null, career: null });
    expect(queries.find(({ sql }) => sql.includes('UPDATE users')).args).toEqual([userId, null, null]);
  });

  it('allows the photo endpoint to update its own generated reference', async () => {
    const { db, queries } = dbForUser();
    const url = `/api/users/photos/${userId}/${randomUUID()}`;
    expect(await setOwnPhoto(db, userId, url)).toMatchObject({ avatar_url: url });
    expect(queries.find(({ sql }) => sql.includes('UPDATE users')).args).toEqual([userId, url]);
  });

  it.each([null, { ...active, status: 'Suspendida' }, { ...active, verification_status: 'No verificado' }])(
    'denies unavailable accounts', async user => {
      const { db } = dbForUser(user);
      await expect(getOwnProfile(db, userId)).rejects.toMatchObject({ status: 403 });
    });
});

it('catalog has all 12 UCSM faculties and no repeated careers inside a faculty', () => {
  expect(academicCatalog).toHaveLength(12);
  expect(academicCatalog.every(entry => entry.careers.length > 0 &&
    new Set(entry.careers).size === entry.careers.length)).toBe(true);
  expect(isAcademicSelection('Ciencias e Ingenierías Físicas y Formales', 'Ingeniería Biomédica')).toBe(true);
  expect(isAcademicSelection('Ciencias Sociales y Humanidades', 'Ingeniería Biomédica')).toBe(false);
});

describe('retired manual student-role flow', () => {
  it.each([createRequest, listMyRequests, listAllRequests, decideRequest])(
    'reports the retired endpoint instead of a fake successful review', async operation => {
      await expect(operation()).rejects.toMatchObject({ status: 410, code: 'ROLE_REQUEST_DISABLED' });
    });
});
