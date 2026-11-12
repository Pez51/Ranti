const escape=value=>String(value??'No indicado').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function financeDocumentHtml(doc){
 if(doc.side){
  const rows=[
   ['Operación',doc.operation_id],['Emisor',doc.issuer],['Serie',doc.series],['Número de muestra',doc.number],
   ['Emisión',doc.issued_at],['Receptor',doc.recipient],['Concepto',doc.concept],['Importe',`S/ ${doc.amount} ${doc.currency}`],
   ['Estado',doc.status],['Referencia',doc.reference],
   ...(doc.destination?[['Destino',doc.destination]]:[]),
   ...(doc.issuer_tax_id?[['RUC',doc.issuer_tax_id],['Impuestos',doc.tax_note]]:[]),
  ];
  return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${escape(doc.title)} — Ranti</title><style>body{font:16px system-ui;color:#163b28;max-width:800px;margin:24px auto;padding:16px}.notice{padding:12px;background:#fff5cc;border:1px solid #ae8c2a}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{padding:8px;border-bottom:1px solid #ccd9cf;text-align:left;overflow-wrap:anywhere}th{width:34%}</style><h1>${escape(doc.title)}</h1><p class="notice">${escape(doc.test_notice)}</p><table>${rows.map(([name,value])=>`<tr><th>${escape(name)}</th><td>${escape(value)}</td></tr>`).join('')}</table></html>`;
 }
 const a=doc.amounts,owner=doc.kind==='owner';
 const rows=[['Operación',doc.operation_id],['Cotización',doc.quote_id],['Fecha del registro',doc.issued_at],['Bien',doc.title],['Modalidad',doc.modality],['Oferente',doc.owner?.name],['Comprador / arrendatario',doc.requester?.name],['Inicio del alquiler',doc.start_date||'No aplica'],['Fin del alquiler',doc.end_date||'No aplica'],['Moneda',doc.currency],
  ...(owner?[['Importe de venta / alquiler',a.gross_amount],['Deducción vigente de Ranti',a.deduction],['Neto del oferente',a.net_amount],['Estado de transferencia',doc.transfer.status],['Condición de liberación',doc.transfer.condition],['Bloqueo actual',doc.transfer.blocked_reason],['Fecha de transferencia',doc.transfer.confirmed_at||'No realizada'],['Referencia de transferencia',doc.transfer.reference||'No existe']]:[['Precio base del artículo',a.price],['Cargo de servicio único',a.service_charge],['Garantía declarada',a.guarantee_declared],['Garantía cobrada de prueba',a.guarantee_charged],['Total aceptado',a.total],['Total pagado de prueba',doc.total_paid],['Tratamiento de garantía',a.guarantee_note]]),
  ['Estado de pago',doc.payment.status],['Entorno',doc.payment.mode],['Referencia de pago',doc.payment.reference||'Pendiente'],['Confirmación de pago',doc.payment.confirmed_at||'Sin confirmar'],
  ...(doc.return_settlement?[[owner?'Parte de garantía asignada de prueba':'Devolución de garantía de prueba',doc.return_settlement.amount],
   ['Referencia de garantía',doc.return_settlement.reference],['Recepción de prueba',doc.return_settlement.received_at||'Sin confirmar']]:[]),
  ...(doc.refund?[[owner?'Ajuste por devolución de prueba':'Reembolso del pago de prueba',doc.refund.amount],
    ['Referencia del reembolso',doc.refund.reference],...(owner?[]:[['Destino del reembolso',doc.refund.destination],['Recepción del reembolso',doc.refund.received_at||'Sin confirmar']])]:[])];
 return `<!doctype html><html lang="es"><meta charset="utf-8"><title>${owner?'Liquidación del oferente':'Constancia del comprador'} — Ranti</title><style>body{font:16px system-ui;color:#163b28;max-width:820px;margin:40px auto;padding:20px}h1{font-size:26px}.notice{padding:16px;background:#fff5cc;border:2px solid #ae8c2a}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:10px;border-bottom:1px solid #ccd9cf;text-align:left;overflow-wrap:anywhere}th{width:40%}@media print{body{margin:0;padding:0}}</style><h1>${owner?'Liquidación del oferente':'Constancia del comprador / arrendatario'}</h1><p class="notice">${escape(doc.test_notice)}</p><table>${rows.map(([name,value])=>`<tr><th>${escape(name)}</th><td>${escape(value)}</td></tr>`).join('')}</table><p>${escape(owner?a.explanation:doc.explanation)}</p><p>Documento operativo, no comprobante tributario. No acredita custodia de garantías ni transferencia de fondos.</p></html>`;
}
export function financeDocumentFilename(doc){
 return `ranti-${doc.kind}-${doc.operation_id}.html`;
}
export function downloadFinanceDocument(doc){
 const url=URL.createObjectURL(new Blob([financeDocumentHtml(doc)],{type:'text/html;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download=financeDocumentFilename(doc);link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
