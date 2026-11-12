import { formatCents } from './finance.policy.js';

const notice = 'DOCUMENTO DE PRUEBA. Sin validez tributaria ni movimiento de dinero real.';

export const financeDocumentKinds = {
 rental: { side: 'buyer', title: 'Boleta de alquiler — muestra' },
 sale: { side: 'buyer', title: 'Boleta de venta — muestra' },
 commission: { side: 'buyer', title: 'Comprobante de comisión — muestra' },
 payment: { side: 'buyer', title: 'Constancia de pago de prueba' },
 guarantee: { side: 'buyer', title: 'Constancia de garantía de prueba' },
 payout: { side: 'owner', title: 'Constancia de abono de prueba' },
 guarantee_refund: { side: 'buyer', title: 'Constancia de devolución de garantía' },
 guarantee_retention: { side: 'owner', title: 'Constancia de importe asignado de la garantía' },
 refund: { side: 'buyer', title: 'Constancia de reembolso de prueba' },
 refund_adjustment: { side: 'owner', title: 'Constancia de ajuste por reembolso' },
};

export function financeDocumentVariants({ quote, payment, transfer, refund, settlement, payout }) {
 if (!quote || !['simulated_succeeded', 'sandbox_succeeded'].includes(payment?.status)) return [];
 const { economics, public_snapshot: snapshot } = quote;
 const records = [];
 const emit = (kind, amount, issuedAt, reference, details = {}) => {
   const { side, title } = financeDocumentKinds[kind];
   const recipient = side === 'buyer' ? snapshot.requester?.name : snapshot.owner?.name;
   records.push({ kind, side, title, operation_id: quote.operation_id, quote_id: quote.id,
     issued_at: issuedAt, reference, series: 'DEMO', number: `${quote.id}-${kind}`,
     issuer: details.issuer ?? 'Ranti · piloto académico', recipient, amount, currency: 'PEN',
     concept: details.concept ?? snapshot.title, destination: details.destination,
     issuer_tax_id: details.fiscal ? 'Pendiente de validación (P18)' : undefined,
     tax_note: details.fiscal ? 'Emisor fiscal, impuestos y numeración sujetos a validación (P18).' : undefined,
     status: 'Emitido para prueba', test_notice: notice });
 };
 const charge = payment.provider_reference;
 emit(snapshot.modality === 'Venta' ? 'sale' : 'rental', formatCents(economics.owner_cents),
   payment.confirmed_at, charge, { issuer: 'Emisor fiscal pendiente de validación (P18)', fiscal: true });
 emit('commission', formatCents(economics.ranti_expected_cents), payment.confirmed_at, charge,
   { fiscal: true, concept: 'Comisión de servicio de Ranti' });
 emit('payment', formatCents(economics.total_cents), payment.confirmed_at, charge, { concept: 'Pago total de prueba' });
 if (BigInt(economics.guarantee_charged_cents) > 0n) {
   emit('guarantee', formatCents(economics.guarantee_charged_cents), payment.confirmed_at, charge,
     { concept: 'Garantía cobrada para la simulación' });
 }
 if (transfer?.status === 'confirmed') {
   const destination = payout ? `${payout.label} •••• ${payout.last_four}` : undefined;
   emit('payout', formatCents(economics.owner_cents), transfer.confirmed_at, transfer.reference,
     { concept: 'Abono del neto al oferente', destination });
 }
 if (settlement?.decided) {
   if (settlement.decided.buyer !== '0.00') {
     emit('guarantee_refund', settlement.decided.buyer, settlement.decided_at, settlement.reference,
       { concept: 'Saldo devuelto al comprador', destination: settlement.buyer_destination });
   }
   if (settlement.decided.owner !== '0.00') {
     emit('guarantee_retention', settlement.decided.owner, settlement.decided_at, settlement.reference,
       { concept: 'Parte aprobada al oferente' });
   }
 }
 if (refund) {
   emit('refund', refund.amount, refund.created_at, refund.reference,
     { concept: 'Reembolso del pago de prueba', destination: refund.destination });
   emit('refund_adjustment', refund.amount, refund.created_at, refund.reference,
     { concept: 'Ajuste del pago por devolución de prueba' });
 }
 return records;
}
