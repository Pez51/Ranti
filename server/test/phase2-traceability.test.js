import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = path => existsSync(new URL(path, root)) ? readFileSync(new URL(path, root), 'utf8') : '';
const diagrams = ['identity-verification-and-role-review', 'publication-risk-and-lifecycle'];

describe('Phase 2 operational documentation contract', () => {
  it('provides canonical identity, profile, role and publication routes', () => {
    const doc = read('README.md');
    for (const route of ['/api/auth/register', '/api/auth/verification/resend', '/api/auth/verification/confirm',
      '/api/auth/login', '/api/users/me', '/api/users/me/role-requests', '/api/admin/role-requests/:id/decision',
      '/api/publications/mine', '/api/publications/:id/submit', '/api/publications/:id/pause',
      '/api/publications/:id/reactivate', '/api/publications/:id/withdraw', '/api/admin/publications/reviews',
      '/api/admin/publications/:id/review']) expect(doc).toContain(route);
  });
  it('documents reproducible migration 004 and atomic historical-gallery failure', () => {
    const doc = read('README.md');
    expect(doc).toContain('npm run migrate --prefix server');
    expect(doc).toContain('server/src/db/migrations/004_publication_image_positions.sql');
    expect(doc).toMatch(/más de cuatro imágenes/);
    expect(doc).toMatch(/atómic/);
  });
  it('states pilot thresholds and the default Egresado/manual Estudiante contract', () => {
    const doc = read('README.md');
    for (const term of ['pilot-v1', 'S/500', 'S/1000', '499.99', '999.99', 'Egresado', 'Estudiante']) expect(doc).toContain(term);
    expect(doc).toMatch(/revisión manual/);
    expect(doc).toMatch(/por defecto.{0,30}Egresado/);
  });
  it('warns about simulation and keeps later RFs and RNF evidence pending', () => {
    const doc = read('README.md'); const revision = read('docs/revision-informe.md');
    for (const term of ['IDENTITY_PROVIDER=simulated', 'IDENTITY_SIMULATOR_EXPOSE_CODE', 'sin SSO real', 'sin envío de correo', 'Por confirmar']) expect(doc).toContain(term);
    for (const rf of ['RF-10', 'RF-11', 'RF-13', 'RF-15', 'RF-31', 'RF-32']) expect(revision).toMatch(new RegExp(`${rf}[^\\n]*Pendiente`));
    expect(revision).toContain('sin DNI');
    expect(revision).toMatch(/sin.{0,40}(piloto|SUS)/i);
    expect(doc + revision).not.toMatch(/publicación se activa inmediatamente|egresados usan correo personal|todos los RF completos|SSO real implementado/i);
  });
  it('links both diagrams and records source-backed alternate paths', () => {
    const doc = read('docs/bpmn/README.md');
    for (const name of diagrams) for (const ext of ['bpmn', 'svg']) expect(doc).toContain(`${name}.${ext}`);
    for (const term of ['IDENTITY_INVALID_CHALLENGE', 'ROLE_REQUEST_PENDING', 'PUBLICATION_CONFLICT',
      'rollback', 'submittedAt', 'draft-modality-unset', 'Por confirmar', 'Confirmada']) expect(doc).toContain(term);
  });
  for (const name of diagrams) it(`${name} is a documented non-executable BPMN with complete DI`, () => {
    const xml = read(`docs/bpmn/${name}.bpmn`);
    for (const ns of ['http://www.omg.org/spec/BPMN/20100524/MODEL', 'http://www.omg.org/spec/BPMN/20100524/DI',
      'http://www.omg.org/spec/DD/20100524/DC', 'http://www.omg.org/spec/DD/20100524/DI']) expect(xml).toContain(ns);
    expect(xml).toContain('isExecutable="false"');
    expect(xml).toContain('<bpmn:documentation>');
    expect(xml).toContain('<bpmndi:BPMNPlane');
    const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(20); expect(new Set(ids).size).toBe(ids.length);
    for (const match of xml.matchAll(/<bpmn:(?:startEvent|endEvent|userTask|serviceTask|businessRuleTask|exclusiveGateway)\b[^>]*id="([^"]+)"/g)) {
      expect(xml).toContain(`bpmnElement="${match[1]}"`);
    }
    for (const match of xml.matchAll(/<bpmn:sequenceFlow\b[^>]*id="([^"]+)"/g)) expect(xml).toContain(`bpmnElement="${match[1]}"`);
    const svg = read(`docs/bpmn/${name}.svg`); expect(svg).toContain('<svg'); expect(svg.length).toBeGreaterThan(1000);
    expect(existsSync(fileURLToPath(new URL(`docs/bpmn/${name}.bpmn`, root)))).toBe(true);
  });
});
