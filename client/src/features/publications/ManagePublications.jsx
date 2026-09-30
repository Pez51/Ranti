import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import PublicationForm from './PublicationForm';
import PublicationStatus from './PublicationStatus';

export default function ManagePublications() {
  const token = getSession()?.token;
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const confirmRef = useRef(null);
  const triggerRef = useRef(null);
  const requestGeneration = useRef(0);
  useEffect(() => {
    if (!token) return;
    const generation = ++requestGeneration.current;
    let cancelled = false;
    const current = () => !cancelled && requestGeneration.current === generation;
    apiRequest('/publications/mine', { token }).then(data => { if (current()) setItems(data); })
      .catch(failure => { if (current()) setError(failure.message); })
      .finally(() => { if (current()) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, revision]);
  useEffect(() => { if (confirmation) confirmRef.current?.focus(); else triggerRef.current?.focus(); }, [confirmation]);
  function refresh() {
    if (loading || busy || confirmation) return;
    // Invalidate immediately, before the replacement effect starts. An old GET
    // must not publish a snapshot or clear the new request's loading/error state.
    requestGeneration.current++;
    setConfirmation(null); setLoading(true); setItems(null); setEditing(null); setError(''); setRevision(value => value + 1);
  }
  function ask(event, item, action, label) {
    if (loading || busy || confirmation) return;
    triggerRef.current = event.currentTarget; setError(''); setConfirmation({ item, action, label });
  }
  async function mutate(item, action, body) {
    if (loading || busy) return;
    // A mutation supersedes every earlier read, irrespective of response order.
    requestGeneration.current++;
    setBusy(true); setError('');
    try {
      const result = await apiRequest(`/publications/${item.id}${action ? `/${action}` : ''}`, { token, method: action ? 'POST' : 'PATCH', ...(body ? { body: JSON.stringify(body) } : {}) });
      setItems(previous => previous ? previous.map(row => row.id === result.id ? result : row) : [result]); setEditing(null); setConfirmation(null);
    } catch (failure) {
      setError(`${failure.message}${failure.status === 409 ? ' Puede haber una operación activa o un cambio de estado. Actualiza las publicaciones antes de reintentar.' : ''}`);
      setConfirmation(null);
    } finally { setBusy(false); }
  }
  if (!token) return <p role="alert">Inicia sesión para gestionar tus publicaciones.</p>;
  return <div className="workflow max-w-4xl mx-auto">
    <h1>Mis publicaciones</h1><Link to="/publicar">Crear publicación</Link>
    <button disabled={loading || busy || Boolean(confirmation)} onClick={refresh}>Actualizar publicaciones</button>
    {loading && <p role="status">Cargando publicaciones…</p>}
    {error && <p role="alert">{error}</p>}
    {items?.length === 0 && <p>Todavía no tienes publicaciones.</p>}
    {items?.map(item => <article key={item.id}>
      <h2>{item.title || 'Borrador sin título'}</h2><PublicationStatus publication={item} />
      {editing === item.id ? <>
        <p>Editar una publicación activa puede enviarla nuevamente a revisión. La decisión anterior deja de ser vigente.</p>
        <PublicationForm initial={item} busy={busy} label="Guardar cambios" onSave={body => mutate(item, null, body)} />
        <button disabled={busy} onClick={() => setEditing(null)}>Cancelar edición</button>
      </> : <div>
        {['Borrador', 'Pausada', 'Activa'].includes(item.status) && <button disabled={busy || Boolean(confirmation)} onClick={() => setEditing(item.id)}>Editar</button>}
        {item.status === 'Borrador' && <button disabled={busy || Boolean(confirmation)} onClick={e => ask(e, item, 'submit', 'Enviar')}>Enviar</button>}
        {item.status === 'Activa' && <button disabled={busy || Boolean(confirmation)} onClick={e => ask(e, item, 'pause', 'Pausar')}>Pausar</button>}
        {item.status === 'Pausada' && <button disabled={busy || Boolean(confirmation)} onClick={e => ask(e, item, 'reactivate', 'Reactivar')}>Reactivar</button>}
        {item.status !== 'Retirada' && <button disabled={busy || Boolean(confirmation)} onClick={e => ask(e, item, 'withdraw', 'Retirar')}>Retirar</button>}
      </div>}
    </article>)}
    {confirmation && <div role="dialog" aria-label={`Confirmar ${confirmation.label}`} onKeyDown={event => { if (event.key === 'Escape' && !busy) setConfirmation(null); }}>
      <h2>{confirmation.label}: {confirmation.item.title || 'Borrador sin título'}</h2>
      <p>{confirmation.action === 'withdraw' ? 'Retirar es definitivo. No podrás reactivar esta publicación.' : 'El servidor verificará los requisitos, el estado actual y las operaciones asociadas.'}</p>
      <button ref={confirmRef} disabled={loading || busy} onClick={() => mutate(confirmation.item, confirmation.action)}>{busy ? 'Procesando…' : 'Confirmar'}</button>
      <button disabled={busy} onClick={() => setConfirmation(null)}>Cancelar</button>
    </div>}
  </div>;
}
