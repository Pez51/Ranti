import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { rentalUnitLabel } from '../../lib/rental-units';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import HandoffPanel from './HandoffPanel';
import OpenChat from './OpenChat';

const actions = { accept: 'Aceptar', reject: 'Rechazar', cancel: 'Cancelar' };
const pageSize = 20;
const reversalStatuses = ['Pendiente de pago/garantía', 'Lista para entrega'];
const money = value => `S/ ${Number(value).toFixed(2)}`;
const dateTime = value => value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—';

export default function Operations() {
  const token = getSession()?.token;
  const [searchParams]=useSearchParams();
  const [side, setSide] = useState(()=>searchParams.get('side')==='received'?'received':'requested');
  const [offset, setOffset] = useState(0);
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
    apiRequest(`/operations/mine?side=${side}&limit=${pageSize}&offset=${offset}`, { token })
      .then(response => { if (!cancelled && generation.current === current) setItems(response.items); })
      .catch(failure => { if (!cancelled && generation.current === current) setError(failure.message); })
      .finally(() => { if (!cancelled && generation.current === current) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, side, offset, revision]);

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
    setSide(next); setOffset(0); setItems(null); setError(''); setLoading(true); setConfirmation(null); setDetail(null); setDetailLoading(false);
  }

  function choosePage(next) {
    if (next < 0 || next > 10000 || next === offset || loading || busy || confirmation) return;
    generation.current++;
    detailGeneration.current++;
    setOffset(next); setItems(null); setError(''); setLoading(true); setDetail(null); setDetailLoading(false);
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

  async function coordinate(item,body,payment=false) {
    if(busy||loading||confirmation)return;
    setBusy(true);setError('');generation.current++;detailGeneration.current++;
    setDetail(null);setDetailLoading(false);
    try{
      const result=await apiRequest(`/operations/${item.id}/${payment?'payment-simulation':'handoff'}`,{token,method:'POST',body:JSON.stringify(body)});
      setItems(previous=>previous?.map(row=>row.id===item.id?result.operation:row));
    }catch(failure){setError(`${failure.message} Actualiza las operaciones si la otra persona hizo cambios.`);}
    finally{setBusy(false);setLoading(true);setRevision(value=>value+1);}
  }

  if (!token) return <p role="alert">Inicia sesión para ver tus operaciones.</p>;
  return <main className="workflow max-w-4xl mx-auto">
    <h1>Mis operaciones</h1>
    <p>Consulta solicitudes, coordina encuentros y confirma entregas o devoluciones. El piloto no procesa pagos ni custodia garantías.</p>
    <div className="operations-view-switch" role="group" aria-label="Vista de operaciones">
      <button type="button" aria-label="Enviadas" aria-pressed={side === 'requested'} disabled={busy} onClick={() => chooseSide('requested')}><ArrowUpRight aria-hidden="true" size={18} />Enviadas{side === 'requested' && <Check aria-hidden="true" size={16} />}</button>
      <button type="button" aria-label="Recibidas" aria-pressed={side === 'received'} disabled={busy} onClick={() => chooseSide('received')}><ArrowDownLeft aria-hidden="true" size={18} />Recibidas{side === 'received' && <Check aria-hidden="true" size={16} />}</button>
      <button type="button" disabled={loading || busy || Boolean(confirmation)} onClick={refresh}>Actualizar operaciones</button>
    </div>
    <div className="operations-view-context">
      <h2>{side === 'requested' ? 'Solicitudes enviadas' : 'Solicitudes recibidas'}</h2>
      <p>{side === 'requested' ? 'Tú solicitaste estos artículos. El oferente responde a tu solicitud.' : 'Otras personas solicitaron tus artículos. Tú decides si aceptas o rechazas.'}</p>
    </div>
    {loading && <p role="status">Cargando operaciones…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && items?.length === 0 && <p>{offset > 0 ? 'No hay operaciones en esta página.' :
      side === 'requested' ? 'No tienes solicitudes enviadas.' : 'No tienes solicitudes recibidas.'}</p>}
    {items?.map(item => <article key={item.id} aria-label={`Operación de ${item.publication?.title || 'publicación'}`}>
      <span className={`operation-direction ${side === 'requested' ? 'is-sent' : 'is-received'}`}>
        {side === 'requested' ? <ArrowUpRight size={18} aria-hidden="true" /> : <ArrowDownLeft size={18} aria-hidden="true" />}
        {side === 'requested' ? 'Enviada por ti' : 'Recibida · Tu artículo'}
      </span>
      <h2>{item.publication?.title || 'Publicación'}</h2>
      <p><strong>{item.handoff?.simulated&&item.status==='Pendiente de pago/garantía'?'Encuentro acordado · Pago simulado pendiente':item.status}</strong> · {item.modality}</p>
      {item.status==='Rechazada'&&<p className="availability-badge">Solicitud denegada. No reserva el artículo.</p>}
      {item.status==='Cancelada'&&<p className="availability-badge">Operación cancelada. Consulta la publicación para conocer su disponibilidad actual.</p>}
      {item.status==='Expirada'&&<p className="availability-badge">Solicitud vencida, sin reserva.</p>}
      {item.offered_price != null && <div className="operation-offer-summary">
        <strong>{item.status === 'Aceptada' ? 'Oferta aceptada' : 'Oferta de precio'}: {money(item.offered_price)}{item.modality === 'Alquiler' ? ` por ${rentalUnitLabel(item.requested_rental_unit)}` : ''}</strong>
        <p>Precio publicado al solicitar: {money(item.requested_price)}. La garantía no cambia.</p>
        {side === 'received' && item.status === 'Pendiente' && <p>Al aceptar acuerdas este monto, no el precio original del anuncio.</p>}
        {side === 'received' && item.offer_pricing && <p>Tarifa de servicio: {money(item.offer_pricing.service_fee)} ({item.offer_pricing.service_fee_percent}%). Neto estimado para ti: {money(item.offer_pricing.owner_net)}. Sin cobro real en el piloto.</p>}
      </div>}
      <p>{item.offered_price == null && <>Precio solicitado: {money(item.requested_price)}{item.modality==='Alquiler'?` por ${rentalUnitLabel(item.requested_rental_unit)}`:''} · </>}Garantía solicitada: {money(item.requested_guarantee_amount)} · Versión {item.requested_contract_version}</p>
      {item.start_date && <p>Del {dateTime(item.start_date)} al {dateTime(item.end_date)} (fin exclusivo).</p>}
      {item.status === 'Pendiente' && <p>Vence: {dateTime(item.request_expires_at)}. Aún no hay reserva.</p>}
      {item.status === 'Aceptada' && <p>Reservado · Pendiente de entrega. La reserva se creó al aceptar; coordina ahora el encuentro. No se ha realizado ningún cobro.</p>}
      {item.status === 'Cancelación en reversión' && <p>Cancelación en reversión: espera la resolución del servidor.</p>}
      {item.decision_reason && <p>Motivo de decisión: {item.decision_reason}</p>}
      {item.cancellation_reason && <p>Motivo de cancelación: {item.cancellation_reason}</p>}
      <p>{side === 'requested' ? 'Oferente del artículo' : 'Solicitante'}: {item.counterpart?.display_name || 'Participante'}</p>
      <button type="button" disabled={busy || detailLoading} onClick={() => openDetail(item)}>Ver detalle</button>
      {item.allowed_actions?.filter(action => Object.hasOwn(actions, action)).map(action =>
        <button type="button" key={action} disabled={busy || Boolean(confirmation) || loading} onClick={() => ask(item, action)}>{item.offered_price != null && action !== 'cancel' ? `${actions[action]} oferta` : actions[action]}</button>)}
      {confirmation?.item.id===item.id && <div role="dialog" aria-label={`Confirmar ${actions[confirmation.action].toLowerCase()}`}>
        <h2>{actions[confirmation.action]}: {confirmation.item.publication?.title}</h2>
        {confirmation.item.offered_price != null && <p className="operation-offer-summary">Oferta: {money(confirmation.item.offered_price)}{confirmation.item.modality === 'Alquiler' ? ` por ${rentalUnitLabel(confirmation.item.requested_rental_unit)}` : ''}, frente al precio publicado de {money(confirmation.item.requested_price)}.
          {confirmation.action === 'accept' && ' Aceptar fija la oferta como precio acordado y crea la reserva; no realiza un cobro.'}</p>}
        <p>El servidor verificará el estado y los permisos antes de confirmar la acción.</p>
        {confirmation.action === 'cancel' && !confirmation.item.handoff?.simulated && reversalStatuses.includes(confirmation.item.status) &&
          <p>Solicitarás una reversión que quedará pendiente de resolución. Esto no confirma la cancelación ni un reembolso.</p>}
        {confirmation.action==='cancel'&&confirmation.item.handoff?.simulated&&<p>En el piloto, cancelar libera la reserva si aún no se declaró la entrega y no hay movimientos económicos reales. La simulación no requiere un reembolso.</p>}
        {confirmation.action !== 'accept' && <label htmlFor="operation-reason">Motivo
          <textarea id="operation-reason" maxLength={500} value={reason} onChange={event => setReason(event.target.value)} />
        </label>}
        <button type="button" disabled={busy} onClick={decide}>{busy ? 'Procesando…' : `Confirmar ${actions[confirmation.action].toLowerCase()}`}</button>
        <button type="button" disabled={busy} onClick={() => setConfirmation(null)}>Volver</button>
      </div>}
      <HandoffPanel key={`${item.id}-${item.handoff?.revision}`} operation={item} busy={busy||loading||Boolean(confirmation)} onAction={body=>coordinate(item,body)} onPayment={()=>coordinate(item,{confirm_simulation:true},true)}/>
      <OpenChat operationId={item.id}/>
    </article>)}
    <nav aria-label="Páginas de operaciones">
      <p>Página {Math.floor(offset / pageSize) + 1}</p>
      <button type="button" disabled={offset === 0 || loading || busy || Boolean(confirmation)} onClick={() => choosePage(offset - pageSize)}>Página anterior</button>
      <button type="button" disabled={loading || busy || Boolean(confirmation) || items?.length !== pageSize || offset >= 10000} onClick={() => choosePage(offset + pageSize)}>Siguiente página</button>
    </nav>
    {detailLoading && <p role="status">Cargando detalle…</p>}
    {detail && <div role="dialog" aria-label="Detalle de operación">
      <h2>Detalle de operación</h2>
      <p className="operation-direction">{side === 'requested' ? 'Enviada por ti' : 'Recibida · Tu artículo'}</p>
      <p>{detail.publication?.title} · {detail.status}</p>
      {detail.offered_price != null && <p>Oferta: {money(detail.offered_price)}{detail.modality === 'Alquiler' ? ` por ${rentalUnitLabel(detail.requested_rental_unit)}` : ''}. Precio publicado: {money(detail.requested_price)}.</p>}
      <p>{side === 'requested' ? 'Oferente del artículo' : 'Solicitante'}: {detail.counterpart?.display_name || 'Participante'}</p>
      <p>{detail.offered_price == null && <>Precio solicitado: {money(detail.requested_price)}{detail.modality==='Alquiler'?` por ${rentalUnitLabel(detail.requested_rental_unit)}`:''} · </>}Garantía: {money(detail.requested_guarantee_amount)}</p>
      {detail.contract_snapshot && <p>Contrato aceptado: versión {detail.contract_snapshot.contract_version}.</p>}
      {detail.contract_snapshot && <p>Precio acordado: {money(detail.contract_snapshot.agreed_price)}{detail.modality === 'Alquiler' ? ` por ${rentalUnitLabel(detail.contract_snapshot.rental_unit)}` : ''}.</p>}
      <Link to={`/producto/${detail.publication_id}`}>Ver publicación</Link>
      <button type="button" onClick={() => setDetail(null)}>Cerrar detalle</button>
    </div>}
  </main>;
}
