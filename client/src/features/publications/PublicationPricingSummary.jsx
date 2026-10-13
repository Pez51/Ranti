const soles=value=>`S/ ${Number(value).toFixed(2)}`;
export default function PublicationPricingSummary({publication,pricing,busy,onBack,onPublish}){
  const loan=pricing.modality==='Préstamo';
  return <section className="publication-pricing" aria-labelledby="publication-pricing-title">
    <h2 id="publication-pricing-title">Revisa tu publicación</h2>
    <p><strong>{publication.title||'Artículo sin título'}</strong> · {pricing.modality}</p>
    {pricing.modality==='Alquiler' && <p>Estimación por {pricing.unit} de alquiler. El total dependerá de la duración acordada; las fechas de disponibilidad no se cobran como un alquiler completo.</p>}
    <dl><dt>{loan?'Precio de uso':'Precio bruto'}</dt><dd>{soles(pricing.gross_amount)}{pricing.modality==='Alquiler'?` / ${pricing.unit}`:''}</dd>
      <dt>Tarifa de servicio Ranti{loan?'':` (${pricing.service_fee_percent}%)`}</dt><dd>− {soles(pricing.service_fee)}</dd>
      <dt>{loan?'Ingreso por el préstamo':'Monto neto estimado para ti'}</dt><dd className="owner-net">{soles(pricing.owner_net)}{pricing.modality==='Alquiler'?` / ${pricing.unit}`:''}</dd>
      {!loan && <><dt>IGV adicional a la tarifa</dt><dd>S/ 0.00</dd></>}
      {pricing.modality!=='Venta' && <><dt>Garantía acordada</dt><dd>{soles(pricing.guarantee_amount)} · No es ganancia</dd></>}
    </dl>
    <p>{loan?'Compartes sin cobrar por el uso y sin comisión de Ranti.':'La tarifa de servicio cubre el uso de Ranti para registrar la operación y sus condiciones: 10% para precios menores de S/60 y 5% desde S/60. Los impuestos del servicio están contemplados dentro de esa tarifa, no se añaden como otro descuento.'}</p>
    <p className="pricing-pilot-note">Vista informativa del piloto académico: no es un cobro, una liquidación ni un comprobante. Ranti no procesa pagos ni custodia garantías reales en este entorno.</p>
    <div className="publication-actions"><button disabled={busy} onClick={onBack}>Volver a editar</button><button disabled={busy} onClick={onPublish}>{busy?'Procesando…':'Enviar publicación'}</button></div>
  </section>;
}
