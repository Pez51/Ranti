export function operationJourney(operation, owner) {
  const sale = operation.modality === 'Venta';
  const steps = [
    ['solicitud', 'Solicitud'],
    ['encuentro', 'Encuentro'],
    ['pago', 'Pago'],
    ['entrega', 'Entrega'],
    ...(!sale ? [['devolucion', 'Devolución']] : []),
    ['cierre', 'Cierre'],
  ];
  const statuses = {
    Pendiente: ['solicitud', owner ? 'Revisa las condiciones y responde a la solicitud.' : 'Espera la respuesta del oferente.'],
    Aceptada: ['encuentro', 'Acuerden el lugar y la hora de entrega.'],
    'Pendiente de pago/garantía': ['pago', owner ? 'El comprador debe confirmar el pago.' : 'Elige un medio y revisa el total antes de confirmar.'],
    'Lista para entrega': ['entrega', 'Confirma la entrega presencial en el encuentro acordado.'],
    'Entregada/Activa': sale ? ['entrega', 'Consulta el estado de cierre de la compra.'] :
      ['devolucion', owner ? 'Inspecciona el artículo y confirma la devolución.' : 'Devuelve el artículo y registra la entrega al oferente.'],
    Cerrada: ['cierre', 'Consulta los documentos, los movimientos y la calificación.'],
    Expirada: [null, 'La solicitud venció. Consulta el estado del pago antes de iniciar otra operación.'],
    Cancelada: [null, 'Consulta el motivo de cancelación y el estado económico.'],
    Rechazada: [null, 'El oferente rechazó la solicitud.'],
    'Cancelación en reversión': [null, 'Consulta el seguimiento de la cancelación.'],
  };
  const [current, message] = statuses[operation.status] ?? [null, operation.status];
  if (current === 'devolucion' && operation.return_overdue) {
    return { steps, current, message: 'La devolución venció. Consulta el expediente y coordina el retorno del equipo.' };
  }
  const settlement = operation.return_settlement;
  if (current === 'devolucion' && settlement) {
    return { steps, current, message: settlement.proposed
      ? owner ? 'Sigue la respuesta del comprador al acta de inspección.' : 'Revisa el acta y responde a la propuesta de garantía.'
      : owner ? 'Confirma la recepción y registra la inspección antes del plazo.' : 'Sigue el plazo de inspección del oferente.' };
  }
  if (current === 'cierre' && settlement?.decided) {
    return { steps, current, message: 'Cierre del alquiler validado. Consulta los movimientos, las constancias y la calificación.' };
  }
  if (operation.status === 'Expirada' && operation.expiry_reason === 'payment_deadline_expired') {
    return { steps, current, message: 'Venció el plazo de pago. Consulta si queda alguna confirmación o devolución pendiente.' };
  }
  return { steps, current, message };
}
