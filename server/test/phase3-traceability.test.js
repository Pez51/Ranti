import { existsSync, readFileSync } from 'node:fs';
import { BpmnModdle } from 'bpmn-moddle';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);
const read = path => existsSync(new URL(path, root)) ? readFileSync(new URL(path, root), 'utf8') : '';
const diagram = 'operation-request-and-reservation';

describe('Phase 3 operations and reservations traceability', () => {
  it('documents the public request, participant list, decision, and cancellation API', () => {
    const doc = read('README.md');
    for (const route of ['POST /api/operations', 'GET /api/operations/mine', 'GET /api/operations/:id',
      'POST /api/operations/:id/accept', 'POST /api/operations/:id/reject',
      'POST /api/operations/:id/cancel']) expect(doc).toContain(route);
    for (const term of ['side=requested|received', 'items, limit, offset', 'OPERATION_REQUEST_TTL_HOURS',
      '48', '1–168', 'contract_version', 'requested_contract_version']) expect(doc).toContain(term);
  });

  it('documents migrations, availability, lifecycle, and honest later-phase seams', () => {
    const doc = read('README.md');
    for (const term of ['005_operation_status_values.sql', '006_operations_reservations.sql',
      '007_sale_reservation_reconciliation.sql', 'ventas heredadas',
      'btree_gist', 'SHARE ROW EXCLUSIVE', 'reconciliación', '[inicio, fin)',
      'Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso',
      'Pendiente', 'Aceptada', 'Cancelación en reversión', 'Disponible',
      'sin snapshot', 'sin reserva', 'sin OTP', 'auditoría', 'outbox',
      'npm run expire:operations --prefix server', 'expiración perezosa',
      'simulación', 'Por confirmar']) expect(doc).toContain(term);
  });

  it('keeps full later requirements pending while recording bounded Phase 3 evidence', () => {
    const revision = read('docs/revision-informe.md');
    for (const rf of ['RF-10', 'RF-11', 'RF-12', 'RF-24', 'RF-25', 'RF-26', 'RF-28'])
      expect(revision).toMatch(new RegExp(`${rf}[^\\n]*Fase 3`));
    for (const rf of ['RF-13', 'RF-14', 'RF-15', 'RF-16', 'RF-17', 'RF-18', 'RF-19',
      'RF-20', 'RF-29', 'RF-30']) expect(revision).toMatch(new RegExp(`${rf}[^\\n]*Pendiente`));
    expect(revision).toMatch(/RNF-02[^\n]*100/);
    expect(revision).toMatch(/RNF-02[^\n]*pendiente/i);
  });

  it('links a documented BPMN with evidence and laid-out exception paths', () => {
    const doc = read('docs/bpmn/README.md');
    const xml = read(`docs/bpmn/${diagram}.bpmn`);
    const svg = read(`docs/bpmn/${diagram}.svg`);
    expect(doc).toContain(`${diagram}.bpmn`);
    expect(doc).toContain(`${diagram}.svg`);
    for (const term of ['self-request', 'invalid dates', 'suspended', 'paused', 'contract_changed',
      'expired', 'rejection', 'concurrent', 'constraint', 'cancellation', 'reversal',
      'duplicate', 'rollback', 'scheduler', 'lazy expiry', 'Por confirmar'])
      expect(doc.toLowerCase()).toContain(term.toLowerCase());
    for (const ns of ['http://www.omg.org/spec/BPMN/20100524/MODEL',
      'http://www.omg.org/spec/BPMN/20100524/DI', 'http://www.omg.org/spec/DD/20100524/DC',
      'http://www.omg.org/spec/DD/20100524/DI']) expect(xml).toContain(ns);
    expect(xml).toContain('isExecutable="false"');
    expect(xml).toContain('<bpmn:documentation>');
    for (const path of ['Req_SelfEnd', 'Req_Invalid', 'Req_Denied', 'Req_Rollback',
      'Dec_Denied', 'Dec_Stale', 'Dec_ExpiredEnd', 'Dec_Reject', 'Dec_Invalidated',
      'Dec_Conflict', 'Dec_Constraint', 'Dec_Accepted', 'Dec_Rollback',
      'Can_Pending', 'Can_Release', 'Can_Reversal', 'Can_Same', 'Can_ExpiredEnd',
      'Can_Rollback', 'Exp_Claim', 'Exp_Empty', 'Exp_Rollback'])
      expect(xml).toContain(`id="${path}"`);
    expect(xml).toContain('server/src/modules/operations/operation.service.js::');
    expect(xml).toContain('Por confirmar');
    expect(xml).toContain('<bpmndi:BPMNPlane');
    const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(40);
    expect(new Set(ids).size).toBe(ids.length);
    for (const match of xml.matchAll(/<bpmn:(?:startEvent|endEvent|userTask|serviceTask|businessRuleTask|exclusiveGateway)\b[^>]*id="([^"]+)"/g))
      expect(xml).toContain(`bpmnElement="${match[1]}"`);
    for (const match of xml.matchAll(/<bpmn:sequenceFlow\b[^>]*id="([^"]+)"/g))
      expect(xml).toContain(`bpmnElement="${match[1]}"`);
    expect(svg).toContain('<svg');
    expect(svg.length).toBeGreaterThan(1000);
  });

  it('routes validation and reservation errors through explicit exclusive gateways', async () => {
    const xml = read(`docs/bpmn/${diagram}.bpmn`);
    const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
    expect(warnings).toEqual([]);
    const processes = rootElement.rootElements.filter(element => element.$type === 'bpmn:Process');
    const nodes = processes.flatMap(process => process.flowElements)
      .filter(element => element.$type !== 'bpmn:SequenceFlow');
    const byId = new Map(nodes.map(node => [node.id, node]));
    expect(processes).toHaveLength(4);

    const expectDecision = (taskId, gatewayId, outcomes) => {
      const task = byId.get(taskId);
      const gateway = byId.get(gatewayId);
      expect(task, taskId).toBeDefined();
      expect(gateway?.$type, gatewayId).toBe('bpmn:ExclusiveGateway');
      expect(task.outgoing.map(flow => flow.targetRef.id), taskId).toEqual([gatewayId]);
      expect(gateway.outgoing.map(flow => [flow.name, flow.targetRef.id]).sort(), gatewayId)
        .toEqual(outcomes.sort());
    };

    expectDecision('Req_Terms', 'Req_TermsResult', [
      ['Válido', 'Req_Save'], ['Inválido', 'Req_Invalid'],
    ]);
    expectDecision('Dec_Accept', 'Dec_InsertResult', [
      ['Sin conflicto', 'Dec_Effects'], ['Constraint', 'Dec_Constraint'],
    ]);
    expect(byId.get('Dec_Commit').outgoing.map(flow => [flow.name, flow.targetRef.id]).sort())
      .toEqual([['Sí', 'Dec_Result'], ['23505/23P01', 'Dec_Constraint'],
        ['Otro error', 'Dec_Rollback']].sort());
    expect(nodes.filter(node => ['bpmn:UserTask', 'bpmn:ServiceTask', 'bpmn:BusinessRuleTask'].includes(node.$type)
      && (node.outgoing?.length ?? 0) > 1).map(node => node.id)).toEqual([]);

    const drawn = new Set(rootElement.diagrams.flatMap(item => item.plane.planeElement)
      .map(element => element.bpmnElement?.id).filter(Boolean));
    for (const id of [...byId.keys(), 'Flow_Req_Terms_Req_TermsResult',
      'Flow_Dec_Accept_Dec_InsertResult', 'Flow_Dec_Commit_Dec_Constraint'])
      expect(drawn.has(id), id).toBe(true);
  });
});
