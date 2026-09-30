import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

const labels = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
function Review({ item, kind, token, onDecided, onBusy }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const role = kind === 'role';
  async function decide(decision) {
    if (!reason.trim()) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const result = await apiRequest(role ? `/admin/role-requests/${item.id}/decision` : `/admin/publications/${item.id}/review`, {
        token, method: 'POST', body: JSON.stringify({ decision, reason: reason.trim(), ...(!role ? { submittedAt: item.submitted_at } : {}) }),
      });
      onDecided(item.id, `Decisión confirmada: ${labels[result.status] || result.status}. ${result.review_reason || ''}`);
    } catch (failure) {
      setError(`${failure.message}${failure.status === 409 ? ' Actualiza las colas: otra decisión, un envío posterior u operaciones activas pueden impedir esta acción.' : ''}`);
      if (failure.status === 409 || failure.status === 403) setStale(true);
    } finally { setBusy(false); onBusy(false); }
  }
  return <section aria-label={role ? `Solicitud: ${item.user.email}` : `Publicación: ${item.title}`}>
    <h3>{role ? item.user.email : item.title}</h3>
    <p>{role ? 'Solicitud de rol Estudiante' : `Riesgo: ${item.risk_level ?? 'Sin calcular'} · Política: ${item.risk_policy_version || 'Sin versión'}`}</p>
    {!role && <><p>{item.description}</p><p>{item.modality} · Precio S/{item.price ?? 0} · Garantía S/{item.guarantee_amount ?? 0}</p></>}
    {(role ? item.evidence_ref : item.provenance_evidence_ref) && <a href={role ? item.evidence_ref : item.provenance_evidence_ref} target="_blank" rel="noreferrer noopener">{role ? 'Ver evidencia de condición académica' : 'Ver evidencia de procedencia'}</a>}
    {role && Object.entries(item.evidence_metadata || {}).map(([key, value]) => <p key={key}>{key}: {value}</p>)}
    <label>Motivo {role ? 'solicitud' : 'publicación'} {item.id}<textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={busy || stale} /></label>
    <button disabled={busy || stale || !reason.trim()} onClick={() => decide('approve')}>Aprobar</button>
    <button disabled={busy || stale || !reason.trim()} onClick={() => decide('reject')}>Rechazar</button>
    {busy && <p role="status">Guardando decisión…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export default function AdminDashboard() {
  const session = getSession();
  const token = session?.user.role === 'Administrador' ? session.token : null;
  const [queues, setQueues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingDecisions, setPendingDecisions] = useState(0);
  useEffect(() => {
    if (!token) return;
    let current = true;
    Promise.all([apiRequest(`/admin/role-requests?limit=20&offset=${page}`, { token }), apiRequest(`/admin/publications/reviews?limit=20&offset=${page}`, { token })])
      .then(([roles, publications]) => { if (current) setQueues({ roles: roles.items, publications: publications.items }); })
      .catch(failure => { if (current) setError(failure.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, revision, page]);
  function refresh(offset = page) { setQueues(null); setError(''); setNotice(''); setLoading(true); setPage(offset); setRevision(value => value + 1); }
  function decided(kind, id, message) { setNotice(message); setQueues(previous => ({ ...previous, [kind]: previous[kind].filter(item => item.id !== id) })); }
  function trackDecision(started) { setPendingDecisions(value => value + (started ? 1 : -1)); }
  if (!token) return <p role="alert">Solo un Administrador puede revisar estas colas.</p>;
  return <div className="workflow max-w-4xl mx-auto">
    <h1>Portal administrativo</h1>
    <p>Revisión de solicitudes y publicaciones. Disputas y auditoría: pendientes de una fase posterior.</p>
    <button disabled={loading || pendingDecisions > 0} onClick={() => refresh()}>Actualizar colas</button>
    {loading && <p role="status">Cargando colas…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {queues && <>
      <h2>Solicitudes de rol</h2>
      {!queues.roles.length && <p>No hay solicitudes pendientes.</p>}
      {queues.roles.map(item => <Review key={`role-${item.id}`} item={item} kind="role" token={token} onBusy={trackDecision} onDecided={(id, message) => decided('roles', id, message)} />)}
      <h2>Publicaciones para revisión</h2>
      {!queues.publications.length && <p>No hay publicaciones pendientes.</p>}
      {queues.publications.map(item => <Review key={`pub-${item.id}`} item={item} kind="publication" token={token} onBusy={trackDecision} onDecided={(id, message) => decided('publications', id, message)} />)}
      <p>Mostrando hasta 20 entradas por cola, desde la posición {page + 1}. Al resolver entradas, actualiza desde el inicio para no omitir pendientes.</p>
      <button disabled={!page || loading || pendingDecisions > 0} onClick={() => refresh(0)}>Volver al inicio</button>
      <button disabled={loading || pendingDecisions > 0 || (queues.roles.length < 20 && queues.publications.length < 20)} onClick={() => refresh(page + 20)}>Siguiente página</button>
    </>}
  </div>;
}
