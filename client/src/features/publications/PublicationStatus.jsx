export default function PublicationStatus({ publication }) {
  return <div role="status" aria-live="polite">
    <p>Estado: {publication.status}</p>
    {publication.status==='Borrador'&&publication.reviewed_at&&publication.review_reason&&<p className="availability-badge">Publicación denegada en revisión · Corrige el borrador y vuelve a enviarlo.</p>}
    {publication.availability && <p className={`availability-badge availability-${publication.availability.state}`}><strong>{publication.availability.label}</strong></p>}
    {publication.availability?.return_pending && <p>El artículo sigue en uso hasta que ambos confirmen su devolución. No se libera automáticamente al vencer la fecha.</p>}
    {publication.availability?.intervals?.map((interval,index)=><p key={index}>Período ocupado: {new Date(interval.start).toLocaleString('es-PE')} → {new Date(interval.end).toLocaleString('es-PE')}{interval.in_use?' · Entregado, devolución pendiente':''}</p>)}
    {publication.operation_counts && <p>Solicitudes: {publication.operation_counts.Pendiente||0} pendientes · {publication.operation_counts.Rechazada||0} denegadas · {publication.operation_counts.Cancelada||0} canceladas · {publication.operation_counts.Expirada||0} vencidas.</p>}
    <p>Riesgo: {publication.risk_level ?? 'Sin calcular'} · Política: {publication.risk_policy_version || 'Sin versión'}</p>
    {publication.review_reason && <p>Motivo de revisión: {publication.review_reason}</p>}
    {publication.status === 'Pendiente de revisión' && <p>Esperando la decisión administrativa. Todavía no está disponible en el catálogo.</p>}
  </div>;
}
