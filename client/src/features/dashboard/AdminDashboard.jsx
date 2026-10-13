import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { downloadProvenance,isPrivateProvenance } from '../../lib/provenance';
import AdminChats from './AdminChats';

function Review({ item, token, onDecided, onBusy }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  async function openEvidence(){setError('');try{await downloadProvenance(item.provenance_evidence_ref,token);}catch(failure){setError(failure.message);}}
  async function decide(decision) {
    if (!reason.trim()) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const result = await apiRequest(`/admin/publications/${item.id}/review`, {
        token, method: 'POST', body: JSON.stringify({ decision, reason: reason.trim(), submittedAt: item.submitted_at }),
      });
      onDecided(item.id, `Decisión confirmada: ${result.status}. ${result.review_reason || ''}`);
    } catch (failure) {
      setError(`${failure.message}${failure.status === 409 ? ' Actualiza las colas: otra decisión, un envío posterior u operaciones activas pueden impedir esta acción.' : ''}`);
      if (failure.status === 409 || failure.status === 403) setStale(true);
    } finally { setBusy(false); onBusy(false); }
  }
  return <section aria-label={`Publicación: ${item.title}`}>
    <h3>{item.title}</h3>
    <p>Riesgo: {item.risk_level ?? 'Sin calcular'} · Política: {item.risk_policy_version || 'Sin versión'}</p>
    <p>{item.description}</p><p>{item.modality} · Precio S/{item.price ?? 0} · Garantía S/{item.guarantee_amount ?? 0}</p>
    {item.provenance_evidence_ref && (isPrivateProvenance(item.provenance_evidence_ref)?<button onClick={openEvidence} disabled={busy}>Ver boleta de procedencia</button>:<a href={item.provenance_evidence_ref} target="_blank" rel="noreferrer noopener">Ver evidencia de procedencia</a>)}
    <label>Motivo publicación {item.id}<textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={busy || stale} /></label>
    <button disabled={busy || stale || !reason.trim()} onClick={() => decide('approve')}>Aprobar</button>
    <button disabled={busy || stale || !reason.trim()} onClick={() => decide('reject')}>Rechazar</button>
    {busy && <p role="status">Guardando decisión…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export default function AdminDashboard() {
  const [session,setSession] = useState(getSession);
  const [showChats,setShowChats] = useState(false);
  useEffect(()=>{const sync=()=>{setSession(getSession());setShowChats(false);};window.addEventListener('ranti-auth-changed',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('ranti-auth-changed',sync);window.removeEventListener('storage',sync);};},[]);
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
    apiRequest(`/admin/publications/reviews?limit=20&offset=${page}`, { token })
      .then(publications => { if (current) setQueues({ publications: publications.items }); })
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
    <p>Revisión de publicaciones. Los roles se determinan por el correo institucional verificado.</p>
    <button type="button" aria-expanded={showChats} onClick={()=>setShowChats(value=>!value)}>{showChats?'Cerrar revisión de chats':'Ver todos los chats'}</button>
    {showChats&&<AdminChats key={token} token={token}/>}
    <button disabled={loading || pendingDecisions > 0} onClick={() => refresh()}>Actualizar colas</button>
    {loading && <p role="status">Cargando colas…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {queues && <>
      <h2>Publicaciones para revisión</h2>
      {!queues.publications.length && <p>No hay publicaciones pendientes.</p>}
      {queues.publications.map(item => <Review key={`pub-${item.id}`} item={item} token={token} onBusy={trackDecision} onDecided={(id, message) => decided('publications', id, message)} />)}
      <p>Mostrando hasta 20 publicaciones desde la posición {page + 1}. Al resolver entradas, actualiza desde el inicio para no omitir pendientes.</p>
      <button disabled={!page || loading || pendingDecisions > 0} onClick={() => refresh(0)}>Volver al inicio</button>
      <button disabled={loading || pendingDecisions > 0 || queues.publications.length < 20} onClick={() => refresh(page + 20)}>Siguiente página</button>
    </>}
  </div>;
}
