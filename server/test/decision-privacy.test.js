import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decideStudentRole } from '../src/modules/users/role-review.service.js';
import { decidePublicationReview } from '../src/modules/publications/publication.service.js';

const owner = randomUUID(); const admin = randomUUID(); const anotherAdmin = randomUUID();
const evidence = 'https://evidence.example.test/private';
const stamp = new Date('2026-09-30T12:00:00.000Z');
function database(row, kind, decision) {
  const client = { release() {}, async query(sql, args) {
    if (sql.includes('FROM users')) return { rows: [{ id: args[0], role: args[0] === owner ? 'Egresado' : 'Administrador',
      status: 'Activa', verification_status: 'Verificado' }] };
    if (sql.includes('FROM role_requests') || sql.includes('FROM publications')) return { rows: [row] };
    if (sql.startsWith(`UPDATE ${kind}`)) return { rows: [{ ...row,
      status: kind === 'role_requests' ? (decision === 'approve' ? 'approved' : 'rejected') : (decision === 'approve' ? 'Activa' : 'Borrador'),
      reviewed_by: admin, reviewed_at: stamp, review_reason: 'Reviewed' }] };
    if (sql.includes('FROM publication_images')) return { rows: [{ image_url: 'https://images.example.test/image' }] };
    return { rows: [] };
  } };
  return { connect: async () => client };
}

describe('administrative decision response privacy', () => {
  for (const decision of ['approve', 'reject']) {
    it.each(['initial', 'same-admin retry', 'another-admin retry'])(`role ${decision}: %s omits all private evidence`, async scenario => {
      const row = { id: randomUUID(), user_id: owner, requested_role: 'Estudiante',
        status: scenario === 'initial' ? 'pending' : decision === 'approve' ? 'approved' : 'rejected',
        evidence_ref: evidence, evidence_metadata: { note: 'private metadata' }, reviewed_by: admin };
      const result = await decideStudentRole(database(row, 'role_requests', decision), {
        adminId: scenario === 'another-admin retry' ? anotherAdmin : admin, requestId: row.id, decision, reason: 'Reviewed' });
      expect(result).toMatchObject({ id: row.id, status: decision === 'approve' ? 'approved' : 'rejected' });
      expect(result).not.toHaveProperty('evidence_ref');
      expect(result).not.toHaveProperty('evidence_metadata');
      expect(JSON.stringify(result)).not.toMatch(/private/);
    });

    it.each(['initial', 'same-admin retry'])(`publication ${decision}: %s omits private evidence`, async scenario => {
      const row = { id: randomUUID(), owner_id: owner, title: 'Item', description: 'Description', category: 'Books', condition: 'Used',
        modality: 'Venta', price: '1000.00', guarantee_amount: '0.00', risk_policy_version: 'pilot-v1', risk_level: 3,
        status: scenario === 'initial' ? 'Pendiente de revisión' : decision === 'approve' ? 'Activa' : 'Borrador',
        provenance_evidence_ref: evidence, submitted_at: stamp, reviewed_by: admin, reviewed_at: stamp, review_reason: 'Reviewed',
        private_future_field: 'private evidence content' };
      const result = await decidePublicationReview(database(row, 'publications', decision), admin, row.id,
        { decision, reason: 'Reviewed', submittedAt: stamp.toISOString() });
      expect(result).toMatchObject({ id: row.id, status: decision === 'approve' ? 'Activa' : 'Borrador' });
      expect(result).not.toHaveProperty('provenance_evidence_ref');
      expect(JSON.stringify(result)).not.toMatch(/private/);
    });
  }
});
