import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { downloadProvenance,isPrivateProvenance } from '../../lib/provenance';
import AdminChats from './AdminChats';
import AdminFinance from './AdminFinance';
import AdminIncidences from './AdminIncidences';
import AdminArco from '../legal/AdminArco';
import AdminAccreditation from '../auth/AdminAccreditation';
import AdminAudit from './AdminAudit';

function Review({ item, token, onDecided, onBusy }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [pending, setPending] = useState(null);
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
    } finally { setPending(null); setBusy(false); onBusy(false); }
  }
  return <section aria-label={`Publicación: ${item.title}`}>
    <h3>{item.title}</h3>
    <p>Riesgo: {item.risk_level ?? 'Sin calcular'} · Política: {item.risk_policy_version || 'Sin versión'}</p>
    <p>{item.description}</p><p>{item.modality} · Precio S/{item.price ?? 0} · Garantía S/{item.guarantee_amount ?? 0}</p>
    {item.provenance_evidence_ref && (isPrivateProvenance(item.provenance_evidence_ref)?<button onClick={openEvidence} disabled={busy}>Ver boleta de procedencia</button>:<a href={item.provenance_evidence_ref} target="_blank" rel="noreferrer noopener">Ver evidencia de procedencia</a>)}
    <label>Motivo publicación {item.id}<textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} disabled={busy || stale || Boolean(pending)} /></label>
    {!pending&&<>{[['approve','Aprobar'],['observe','Pedir correcciones'],['reject','Rechazar']].map(([value,label])=>
      <button key={value} disabled={busy||stale||!reason.trim()} onClick={()=>setPending(value)}>{label}</button>)}</>}
    {pending&&<div role="group" aria-label="Confirmación de revisión">
      <p>{pending==='approve'?'El artículo quedará visible en el catálogo.':pending==='observe'?'El oferente recibirá las observaciones y podrá corregir el borrador.':'Se rechazará este envío y la publicación volverá a borrador.'}</p>
      <p>{reason.trim()}</p>
      <button disabled={busy} onClick={()=>decide(pending)}>Confirmar decisión</button>
      <button disabled={busy} onClick={()=>setPending(null)}>Volver a la revisión</button>
    </div>}
    {busy && <p role="status">Guardando decisión…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export default function AdminDashboard() {
  const [params,setParams] = useSearchParams();
  const [session,setSession] = useState(getSession);
  const [showChats,setShowChats] = useState(false);
  const [showFinance,setShowFinance] = useState(false);
  const [showIncidences,setShowIncidences] = useState(false);
  const [showPrivacy,setShowPrivacy] = useState(false);
  const [showAccreditation,setShowAccreditation] = useState(false);
  const [showAudit,setShowAudit] = useState(false);
  const financeVisible = showFinance || params.get('finanzas') === '1';
  const operationRef = params.get('operacion') || '';
  useEffect(()=>{const sync=()=>{setSession(getSession());setShowChats(false);setShowFinance(false);setShowIncidences(false);setShowPrivacy(false);setShowAccreditation(false);setShowAudit(false);};window.addEventListener('ranti-auth-changed',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('ranti-auth-changed',sync);window.removeEventListener('storage',sync);};},[]);
  const token = session?.user.role === 'Administrador' ? session.token : null;
  const [queues, setQueues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);
  const [pendingDecisions, setPendingDecisions] = useState(0);
  const [filters, setFilters] = useState('');
  useEffect(() => {
    if (!token) return;
    let current = true;
    apiRequest(`/admin/publications/reviews?limit=20&offset=${page}${filters}`, { token })
      .then(publications => { if (current) setQueues({ publications: publications.items }); })
      .catch(failure => { if (current) setError(failure.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, revision, page, filters]);
  function refresh(offset = page) { setQueues(null); setError(''); setNotice(''); setLoading(true); setPage(offset); setRevision(value => value + 1); }
  function decided(kind, id, message) { setNotice(message); setQueues(previous => ({ ...previous, [kind]: previous[kind].filter(item => item.id !== id) })); }
  function trackDecision(started) { setPendingDecisions(value => value + (started ? 1 : -1)); }
  if (!token) return <p role="alert">Solo un Administrador puede revisar estas colas.</p>;
  return <div className="workflow max-w-4xl mx-auto">
    <h1>Portal administrativo</h1>
    <p>Revisión de publicaciones. Los roles se determinan por el correo institucional verificado.</p>
    <button type="button" aria-expanded={showChats} onClick={()=>setShowChats(value=>!value)}>{showChats?'Cerrar revisión de chats':'Ver todos los chats'}</button>
    {showChats&&<AdminChats key={token} token={token}/>}
    <button type="button" aria-expanded={financeVisible} onClick={()=>{
      if(params.get('finanzas')==='1')setParams(previous=>{const next=new URLSearchParams(previous);next.delete('finanzas');next.delete('operacion');return next;});
      setShowFinance(!financeVisible);
    }}>{financeVisible?'Cerrar control económico':'Ver control económico'}</button>
    {financeVisible&&<AdminFinance key={`${token}:${operationRef}`} token={token} initialSearch={operationRef}/>}
    <button type="button" aria-expanded={showIncidences} onClick={()=>setShowIncidences(value=>!value)}>{showIncidences?'Cerrar gestión de incidencias':'Gestionar incidencias'}</button>
    {showIncidences&&<AdminIncidences key={token} token={token}/>}
    <button type="button" aria-expanded={showAccreditation} onClick={()=>setShowAccreditation(value=>!value)}>Acreditaciones de egresados</button>
    {showAccreditation&&<AdminAccreditation key={token} token={token}/>}
    <button type="button" aria-expanded={showPrivacy} onClick={()=>setShowPrivacy(value=>!value)}>Solicitudes de privacidad</button>
    {showPrivacy&&<AdminArco key={token} token={token}/>}
    <button type="button" aria-expanded={showAudit} onClick={()=>setShowAudit(value=>!value)}>Consultar bitácora</button>
    {showAudit&&<AdminAudit key={token} token={token}/>}
    <button disabled={loading || pendingDecisions > 0} onClick={() => refresh()}>Actualizar colas</button>
    <form onSubmit={event=>{
      event.preventDefault();
      const next=new URLSearchParams();
      for(const [field,value] of new FormData(event.currentTarget))if(typeof value==='string'&&value.trim())next.set(field,value.trim());
      setFilters(next.size?`&${next}`:'');refresh(0);
    }}>
      <label>Publicación<input name="search" maxLength={100}/></label>
      <label>Riesgo<select name="risk"><option value="">Todos</option><option value="3">Nivel 3</option>
        <option value="2">Nivel 2</option><option value="1">Nivel 1</option></select></label>
      <button disabled={loading||pendingDecisions>0}>Filtrar publicaciones</button>
    </form>
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
