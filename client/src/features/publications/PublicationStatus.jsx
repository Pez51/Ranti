export default function PublicationStatus({ publication }) {
  return <div role="status" aria-live="polite">
    <p>Estado: {publication.status}</p>
    <p>Riesgo: {publication.risk_level ?? 'Sin calcular'} · Política: {publication.risk_policy_version || 'Sin versión'}</p>
    {publication.review_reason && <p>Motivo de revisión: {publication.review_reason}</p>}
    {publication.status === 'Pendiente de revisión' && <p>Esperando la decisión administrativa. Todavía no está disponible en el catálogo.</p>}
  </div>;
}
