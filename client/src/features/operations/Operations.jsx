import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

const actions = { accept: 'Aceptar', reject: 'Rechazar', cancel: 'Cancelar' };
const money = value => `S/ ${Number(value).toFixed(2)}`;
const dateTime = value => value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—';

export default function Operations() {
  const token = getSession()?.token;
  const [side, setSide] = useState('requested');
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const generation = useRef(0);
  const detailGeneration = useRef(0);

  useEffect(() => {
    if (!token) return;
    const current = ++generation.current;
    let cancelled = false;
    apiRequest(`/operations/mine?side=${side}`, { token })
      .then(response => { if (!cancelled && generation.current === current) setItems(response.items); })
      .catch(failure => { if (!cancelled && generation.current === current) setError(failure.message); })
      .finally(() => { if (!cancelled && generation.current === current) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, side, revision]);

  function refresh() {
    if (loading || busy || confirmation) return;
    generation.current++;
    detailGeneration.current++;
    setItems(null); setError(''); setLoading(true); setDetail(null); setDetailLoading(false);
    setRevision(value => value + 1);
  }

  function chooseSide(next) {
    if (next === side || busy) return;
    generation.current++;
    detailGeneration.current++;
    setSide(next); setItems(null); setError(''); setLoading(true); setConfirmation(null); setDetail(null); setDetailLoading(false);
  }

  function ask(item, action) {
    setConfirmation({ item, action }); setReason(''); setError('');
  }

  async function openDetail(item) {
    const current = ++detailGeneration.current;
    setDetailLoading(true); setError('');
    try {
      const response = await apiRequest(`/operations/${item.id}`, { token });
      if (detailGeneration.current === current) setDetail(response.operation);
    } catch (failure) { if (detailGeneration.current === current) setError(failure.message); }
    finally { if (detailGeneration.current === current) setDetailLoading(false); }
  }

  async function decide() {
    if (!confirmation || busy) return;
    const { item, action } = confirmation;
    const normalized = reason.trim();
    if (action !== 'accept' && (normalized.length < 1 || normalized.length > 500)) {
      setError('Escribe un motivo de 1 a 500 caracteres.'); return;
    }
    detailGeneration.current++;
    setDetail(null); setDetailLoading(false);
    setBusy(true); setError(''); generation.current++;
    try {
      const response = await apiRequest(`/operations/${item.id}/${action}`, {
        token, method: 'POST', body: JSON.stringify(action === 'accept' ? {} : { reason: normalized }),
      });
      setItems(previous => previous?.map(row => row.id === item.id ? response.operation : row) ?? []);
      setConfirmation(null);
    } catch (failure) {
      setError(`${failure.message}${failure.status === 409 ? ' El estado pudo haber cambiado; revisa la operación actualizada.' : ''}`);
      setConfirmation(null);
    } finally {
      // Decision responses are authoritative, then a fresh participant read catches
      // concurrent expiry or a competing decision without claiming an optimistic state.
      setBusy(false); setLoading(true); setRevision(value => value + 1);
    }
  }

  if (!token) return <p role="alert">Inicia sesión para ver tus operaciones.</p>;
  return <main className="workflow max-w-4xl mx-auto">
    <h1>Mis operaciones</h1>
    <p>Las solicitudes están sujetas a decisión del oferente. Pagos, garantías y entrega aún no disponibles.</p>
    <div role="group" aria-label="Vista de operaciones">
      <button type="button" aria-pressed={side === 'requested'} disabled={busy} onClick={() => chooseSide('requested')}>Enviadas</button>
      <button type="button" aria-pressed={side === 'received'} disabled={busy} onClick={() => chooseSide('received')}>Recibidas</button>
      <button type="button" disabled={loading || busy || Boolean(confirmation)} onClick={refresh}>Actualizar operaciones</button>
    </div>
    {loading && <p role="status">Cargando operaciones…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && items?.length === 0 && <p>{side === 'requested' ? 'No tienes solicitudes enviadas.' : 'No tienes solicitudes recibidas.'}</p>}
    {items?.map(item => <article key={item.id} aria-label={`Operación de ${item.publication?.title || 'publicación'}`}>
      <h2>{item.publication?.title || 'Publicación'}</h2>
      <p><strong>{item.status}</strong> · {item.modality}</p>
      <p>Precio solicitado: {money(item.requested_price)} · Garantía solicitada: {money(item.requested_guarantee_amount)} · Versión {item.requested_contract_version}</p>
      {item.start_date && <p>Del {dateTime(item.start_date)} al {dateTime(item.end_date)} (fin exclusivo).</p>}
      {item.status === 'Pendiente' && <p>Vence: {dateTime(item.request_expires_at)}. Aún no hay reserva.</p>}
      {item.status === 'Aceptada' && <p>Solicitud aceptada por el servidor. La reserva se creó al aceptar. Pagos, garantías y entrega aún no disponibles.</p>}
      {item.status === 'Cancelación en reversión' && <p>Cancelación en reversión: espera la resolución del servidor.</p>}
      {item.decision_reason && <p>Motivo de decisión: {item.decision_reason}</p>}
      {item.cancellation_reason && <p>Motivo de cancelación: {item.cancellation_reason}</p>}
      <p>Contraparte: {item.counterpart?.display_name || 'Participante'}</p>
      <button type="button" disabled={busy || detailLoading} onClick={() => openDetail(item)}>Ver detalle</button>
      {item.allowed_actions?.filter(action => Object.hasOwn(actions, action)).map(action =>
        <button type="button" key={action} disabled={busy || Boolean(confirmation) || loading} onClick={() => ask(item, action)}>{actions[action]}</button>)}
    </article>)}
    {detailLoading && <p role="status">Cargando detalle…</p>}
    {detail && <div role="dialog" aria-label="Detalle de operación">
      <h2>Detalle de operación</h2>
      <p>{detail.publication?.title} · {detail.status}</p>
      <p>Contraparte: {detail.counterpart?.display_name || 'Participante'}</p>
      <p>Precio solicitado: {money(detail.requested_price)} · Garantía: {money(detail.requested_guarantee_amount)}</p>
      {detail.contract_snapshot && <p>Contrato aceptado: versión {detail.contract_snapshot.contract_version}.</p>}
      <Link to={`/producto/${detail.publication_id}`}>Ver publicación</Link>
      <button type="button" onClick={() => setDetail(null)}>Cerrar detalle</button>
    </div>}
    {confirmation && <div role="dialog" aria-label={`Confirmar ${actions[confirmation.action].toLowerCase()}`}>
      <h2>{actions[confirmation.action]}: {confirmation.item.publication?.title}</h2>
      <p>El servidor verificará el estado y los permisos antes de confirmar la acción.</p>
      {confirmation.action !== 'accept' && <label htmlFor="operation-reason">Motivo
        <textarea id="operation-reason" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
      </label>}
      <button type="button" disabled={busy} onClick={decide}>{busy ? 'Procesando…' : `Confirmar ${actions[confirmation.action].toLowerCase()}`}</button>
      <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Volver</button>
    </div>}
  </main>;
}
