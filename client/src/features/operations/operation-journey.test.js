import { describe, expect, it } from 'vitest';
import { operationJourney } from './operation-journey';

describe('recorrido de una operación', () => {
  it('lleva al comprador del pago a la entrega solo después de confirmar el pago', () => {
    const op = { modality: 'Alquiler', status: 'Pendiente de pago/garantía', handoff: { agreed: true } };
    expect(operationJourney(op, false).current).toBe('pago');
    expect(operationJourney({ ...op, status: 'Lista para entrega' }, false).current).toBe('entrega');
  });

  it('distingue inspección y cierre del alquiler de la recepción de una venta', () => {
    const op = { status: 'Entregada/Activa', handoff: { delivered: true } };
    expect(operationJourney({ ...op, modality: 'Alquiler' }, true).current).toBe('devolucion');
    expect(operationJourney({ ...op, modality: 'Venta' }, false).current).toBe('entrega');
    expect(operationJourney({ ...op, modality: 'Venta', status: 'Cerrada' }, false).current).toBe('cierre');
  });

  it('conserva el seguimiento financiero y evita sugerir otro cobro al caducar', () => {
    const result = operationJourney({ modality: 'Venta', status: 'Expirada' }, false);
    expect(result.current).toBeNull();
    expect(result.message).toMatch(/venció/);
  });
});
