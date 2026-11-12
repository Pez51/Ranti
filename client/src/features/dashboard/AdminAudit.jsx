import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBlob, apiRequest } from '../../lib/api';

export default function AdminAudit({ token }) {
  const [filters, setFilters] = useState('');
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/admin/audit?offset=${offset}${filters}`, {token,signal:controller.signal})
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  },[filters,offset,token]);
  function search(event) {
    event.preventDefault();
    const next = new URLSearchParams();
    for (const [field,value] of new FormData(event.currentTarget)) if (typeof value === 'string' && value.trim()) next.set(field,value.trim());
    const suffix = next.size ? `&${next}` : '';
    if(suffix===filters&&offset===0) return;
    setError(''); setResult(null); setFilters(suffix); setOffset(0);
  }
  function page(next) {
    setError(''); setResult(null); setOffset(next);
  }
  async function download() {
    setError('');
    try {
      const blob = await apiBlob(`/admin/audit/export?offset=${offset}${filters}`, { token });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'ranti-bitacora.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure.message); }
  }
  return <section aria-label="Bitácora administrativa">
    <h2>Bitácora administrativa</h2>
    <form onSubmit={search}>
      <label>Acción<input name="action" maxLength={100} /></label>
      <label>Tipo de registro<select name="entity"><option value="">Todos</option>
        <option value="operation">Operación</option><option value="publication">Publicación</option>
        <option value="incidence">Incidencia</option><option value="admin-finance">Control económico</option>
      </select></label>
      <label>Identificador de referencia<input name="reference" maxLength={36}/></label>
      <label>Identificador del actor<input name="actor" maxLength={36}/></label>
      <label>Desde<input name="from" type="date"/></label>
      <label>Hasta<input name="until" type="date"/></label>
      <button>Buscar en la bitácora</button>
      <button type="button" onClick={download}>Exportar registros de esta búsqueda</button>
    </form>
    {error&&<p role="alert">{error}</p>}
    {!result&&!error&&<p role="status">Cargando bitácora…</p>}
    {result?.items.length===0&&<p>No hay eventos para estos filtros.</p>}
    {result?.items.map(event => <article key={event.id}>
      <h3>{event.action}</h3>
      <p>{event.actor_name||'Sistema'} · {new Date(event.timestamp).toLocaleString('es-PE',{timeZone:'America/Lima'})}</p>
      <p>{event.entity_type} · {event.entity_id}</p>
      {Object.keys(event.before).length>0&&<p>Antes · {Object.entries(event.before).map(([key,value])=>`${key} ${value}`).join(' · ')}</p>}
      {Object.keys(event.after).length>0&&<p>Después · {Object.entries(event.after).map(([key,value])=>`${key} ${value}`).join(' · ')}</p>}
      {event.entity_type==='operation'&&<Link to={`/admin?finanzas=1&operacion=${event.entity_id}`}>Consultar movimientos</Link>}
    </article>)}
    <button type="button" disabled={offset===0||!result} onClick={()=>page(offset-20)}>Página anterior de bitácora</button>
    <button type="button" disabled={!result?.has_more} onClick={()=>page(offset+20)}>Página siguiente de bitácora</button>
  </section>;
}
