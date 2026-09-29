import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getOwnProfile, updateOwnProfile } from '../src/modules/users/profile.service.js';
import { requestStudentRole, listPendingRoleRequests, decideStudentRole } from '../src/modules/users/role-review.service.js';

const userId = randomUUID();
const adminId = randomUUID();
const requestId = randomUUID();
const active = { id: userId, role: 'Egresado', status: 'Activa', verification_status: 'Verificado',
  email: 'owner@ucsm.edu.pe', display_name: null, avatar_url: null, faculty: null,
  academic_condition: 'caller-controlled', reputation_score: '4.25', operations_count: 7,
  created_at: new Date('2026-01-01T00:00:00Z') };
const denied = { code: 'ACCOUNT_UNAVAILABLE', status: 403 };
const invalid = { code: 'INVALID_INPUT', status: 400 };
const unauthorized = { code: 'FORBIDDEN', status: 403 };

function dbForUser(user = active) {
  const queries = [];
  const client = { query: async (sql, args) => {
    queries.push({ sql, args });
    if (sql.includes('FROM users')) return { rows: user ? [user] : [] };
    if (sql.includes('UPDATE users')) return { rows: [{ ...user, ...args?.[1] }] };
    if (sql.includes('FROM role_requests')) return { rows: [] };
    if (sql.includes('INSERT INTO role_requests')) return { rows: [{ id: requestId, user_id: userId, status: 'pending', evidence_ref: args[1] }] };
    return { rows: [] };
  }, release: () => {} };
  return { db: { query: client.query, connect: async () => client }, queries };
}

describe('profile and role review validation', () => {
  it('projects only current safe profile fields and derives academic condition from role', async () => {
    const { db } = dbForUser();
    expect(await getOwnProfile(db, userId)).toEqual({ id: userId, email: 'owner@ucsm.edu.pe',
      role: 'Egresado', academic_condition: 'Egresado', university: 'Universidad Católica de Santa María',
      display_name: null, avatar_url: null, faculty: null, reputation_score: '4.25',
      operations_count: 7, created_at: active.created_at });
  });

  it.each(['email', 'role', 'academic_condition', 'reputation_score', 'operations_count',
    'verification_status', 'status', 'identity_provider', 'terms_version', 'created_at', 'unknown'])(
    'rejects protected or unknown profile field %s before SQL', async field => {
      const { db, queries } = dbForUser();
      await expect(updateOwnProfile(db, userId, { [field]: 'malicious' })).rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    });

  it.each(['https://@', 'https://host:bad/path', 'https://host:0/path', 'https://host:65536/path',
    'https://name:secret@host/path', 'http://host/path', 'https://bad..host/path'])(
    'rejects malformed or unsafe profile avatar URL %s', async avatar_url => {
      const { db, queries } = dbForUser();
      await expect(updateOwnProfile(db, userId, { avatar_url })).rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    });

  it.each(['https://@', 'https://host:bad/path', 'https://host:0/path', 'https://host:65536/path',
    'https://name:secret@host/path', 'http://host/path', 'https://bad..host/path'])(
    'rejects malformed or unsafe evidence URL %s', async evidence_ref => {
      const { db, queries } = dbForUser();
      await expect(requestStudentRole(db, { userId, evidence_ref, evidence_metadata: {} })).rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    });

  it.each([{ dni: '12345678' }, { nested: { password: 'secret' } }, { nested: [{ token: 'secret' }] },
    { document_number: '123' }, { evidence_content: 'private' }])(
    'rejects sensitive evidence metadata before SQL: %j', async evidence_metadata => {
      const { db, queries } = dbForUser();
      await expect(requestStudentRole(db, { userId, evidence_ref: 'https://host/id', evidence_metadata }))
        .rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    });

  it('rejects oversized and non-object evidence metadata before SQL', async () => {
    for (const evidence_metadata of [[], null, { description: 'x'.repeat(5000) }]) {
      const { db, queries } = dbForUser();
      await expect(requestStudentRole(db, { userId, evidence_ref: 'https://host/id', evidence_metadata }))
        .rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    }
  });

  it.each([{ limit: 0 }, { limit: 101 }, { offset: -1 }, { limit: '10' }])(
    'rejects invalid admin pagination %j before SQL', async page => {
      const { db, queries } = dbForUser();
      await expect(listPendingRoleRequests(db, { adminId, ...page })).rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    });

  it.each([{ decision: 'approve', reason: '  ' }, { decision: 'reject', reason: 'x'.repeat(501) },
    { decision: 'other', reason: 'Valid reason' }])('rejects malformed decision %j before SQL', async input => {
      const { db, queries } = dbForUser();
      await expect(decideStudentRole(db, { adminId, requestId, ...input })).rejects.toMatchObject(invalid);
      expect(queries).toHaveLength(0);
    });

  it.each([null, { ...active, status: 'Suspendida' }, { ...active, verification_status: 'No verificado' }])(
    'denies unavailable current profile state', async user => {
      const { db } = dbForUser(user);
      await expect(getOwnProfile(db, userId)).rejects.toMatchObject(denied);
    });

  it('requires current administrator state before reading pending evidence', async () => {
    const { db, queries } = dbForUser(active);
    await expect(listPendingRoleRequests(db, { adminId, limit: 10, offset: 0 })).rejects.toMatchObject(unauthorized);
    expect(queries.some(({ sql }) => sql.includes('FROM role_requests'))).toBe(false);
  });
});
