import { useEffect, useState } from 'react';
import ReturnPanel from './ReturnPanel';
import { peruLocalToIso, peruTime } from './operation-time';

function DeliveryCode({ operation, busy, onAction, onRefresh, onIncident, onCancel }) {
  const handoff = operation.handoff;
  const { delivery_code_expires_at: expiresAt, delivery_window_ends_at: windowEndsAt } = handoff;
  const [now, setNow] = useState(Date.now);
  const [present, setPresent] = useState(false);
  const [accessories, setAccessories] = useState(false);
  const [code, setCode] = useState('');
  const expiry = expiresAt ? Date.parse(expiresAt) : null;
  const expired = expiry != null && expiry <= now;
  const windowClosed = windowEndsAt && Date.parse(windowEndsAt) <= now;
  const beforeMeeting = handoff.meeting_at && Date.parse(handoff.meeting_at) > now;
  const locked = handoff.delivery_locked && !expired;
  const live = handoff.delivery_code && !expired && !locked && !windowClosed;
  const waitingForCode = handoff.delivery_attempts_remaining != null && !expiresAt;
  const caseOpen = operation.pending_incidence_count > 0;
  const canVerify = present && /^\d{6}$/.test(code) && !locked && !expired && !windowClosed && !waitingForCode && !beforeMeeting && !caseOpen;
  const mayReportFailure = handoff.meeting_at && !beforeMeeting;
  const timeLeft = expiry && !expired ? Math.ceil((expiry - now) / 1000) : 0;
  useEffect(() => {
    if (!expiresAt && !windowEndsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, windowEndsAt]);

  return <section aria-label="Código de entrega">
    <h4>{handoff.is_owner ? 'Validar entrega con OTP' : 'Entrega presencial del equipo'}</h4>
    <p><strong>Pago de prueba confirmado.</strong> Comparte el código durante el encuentro.</p>
    {locked && <p role="status">Código bloqueado por el límite de intentos. Espera a que venza antes de generar otro.</p>}
    {expired && <p role="status">El código venció. {handoff.is_owner ? 'Pide otro al comprador durante el encuentro.' : 'Puedes generar otro durante el encuentro.'}</p>}
    {windowClosed && <p role="status">El plazo para validar la entrega terminó. Reporta lo sucedido para solicitar una revisión.</p>}
    {beforeMeeting && <p>El código estará disponible desde la hora acordada.</p>}
    {caseOpen && <p role="status">La entrega espera la resolución del expediente abierto.</p>}
    {timeLeft > 0 && <p>Vigencia restante: {Math.floor(timeLeft / 60)} min {timeLeft % 60} s. Vence a las {peruTime(expiresAt)} (Perú).</p>}
    {handoff.is_owner ? <form onSubmit={event => {
      event.preventDefault();
      if (canVerify) onAction({ action: 'verify-delivery-code', revision: handoff.revision, code, accessories_confirmed: true });
    }}>
      {handoff.delivery_attempts_remaining != null && <p>Intentos restantes: {handoff.delivery_attempts_remaining}.</p>}
      {waitingForCode && !windowClosed && <p>El comprador puede generar el código cuando revisen juntos el equipo.</p>}
      <label>Código de seis dígitos mostrado por el comprador
        <input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} />
      </label>
      <label><input type="checkbox" checked={present} onChange={event => setPresent(event.target.checked)} /> Entrego físicamente el equipo y los accesorios acordados.</label>
      <button disabled={busy || !canVerify}>Validar y registrar entrega</button>
    </form> : <>
      <label><input type="checkbox" checked={present} onChange={event => setPresent(event.target.checked)} /> Estoy con el oferente y revisé el equipo.</label>
      <label><input type="checkbox" checked={accessories} onChange={event => setAccessories(event.target.checked)} /> Los accesorios coinciden con el contrato.</label>
      {live && <p role="status">Código de entrega <strong className="delivery-otp">{handoff.delivery_code}</strong></p>}
      <button type="button" disabled={busy || !present || !accessories || locked || Boolean(windowClosed) || Boolean(beforeMeeting) || caseOpen}
        onClick={() => onAction({ action: live ? 'regenerate-delivery-code' : 'generate-delivery-code', revision: handoff.revision, accessories_confirmed: true })}>
        {live ? 'Generar otro código e invalidar el anterior' : 'Generar código para esta entrega'}
      </button>
    </>}
    <div className="operation-panel-actions">
      {onRefresh && <button type="button" disabled={busy} onClick={onRefresh}>Consultar estado de entrega</button>}
      {!handoff.is_owner && <button type="button" disabled={busy || !mayReportFailure} onClick={() => onIncident('delivery_absence')}>Reportar que el oferente no llegó</button>}
      <button type="button" disabled={busy || !handoff.is_owner && !mayReportFailure} onClick={() => onIncident(handoff.is_owner ? 'meeting' : 'delivery_not_validated')}>
        {handoff.is_owner ? 'Reportar incidencia de entrega' : 'Reportar entrega sin validar'}
      </button>
      {!handoff.is_owner && <button type="button" disabled={busy}
        onClick={onCancel || (() => onIncident('paid_cancellation'))}>Solicitar cancelación antes de entrega</button>}
    </div>
  </section>;
}

export default function HandoffPanel({ operation, busy = false, onAction, onPayment = null, token = null, onRefresh = null, onIncident = null, onCancel = null, coordinationHref = null, movementsHref = null }) {
  const h=operation.handoff;
  const [editing,setEditing]=useState(false);
  const [location,setLocation]=useState(h?.location||'');
  const [meeting,setMeeting]=useState('');
  const [notes,setNotes]=useState(h?.notes||'');
  const [confirm,setConfirm]=useState(null);
  const [error,setError]=useState('');
  if(!h||!['Aceptada','Pendiente de pago/garantía','Lista para entrega','Entregada/Activa','Cerrada'].includes(operation.status))return null;
  const locked=h.your_delivery_confirmed||h.other_delivery_confirmed;
  const coordinating=['Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(operation.status);
  const deliveryBefore=operation.modality!=='Venta'&&operation.start_date?new Date(operation.start_date):null;
  function propose(event) {
    event.preventDefault();setError('');
    const meetingAt=peruLocalToIso(meeting);
    if(!meetingAt||location.trim().length<3){setError('Indica lugar, fecha y hora de Perú.');return;}
    if(deliveryBefore&&new Date(meetingAt)>=deliveryBefore){setError('La entrega debe ser antes del inicio del alquiler o préstamo. Elige un horario anterior.');return;}
    onAction({action:'propose',revision:h.revision,location:location.trim(),meeting_at:meetingAt,notes});
    setEditing(false);
  }
  function act(action){onAction({action,revision:h.revision});setConfirm(null);}
  function report(reason,caseId=null){
    if(onIncident){onIncident(reason,caseId);return;}
    const params=new URLSearchParams({incidence:reason});
    if(caseId)params.set('case',caseId);
    window.location.assign(`/operaciones/${encodeURIComponent(operation.id)}?${params}`);
  }
  return <section className="handoff-panel" aria-label="Coordinación de entrega">
    <h3>{h.returned?'Devolución confirmada':h.delivered?(operation.modality==='Venta'?'Vendido · Entrega confirmada':operation.modality==='Alquiler'?'Alquilado · En uso':'Prestado · En uso'):'Coordinar entrega'}</h3>
    <p>Registro del piloto: estas confirmaciones no acreditan pagos, seguros ni custodia de garantías.</p>
    {coordinating&&<p>El calendario es opcional. Pueden acordar la entrega por chat y registrar aquí el lugar y la hora.</p>}
    {coordinating&&deliveryBefore&&<p>Entrega antes del {peruTime(deliveryBefore)} (Perú), cuando empieza el período solicitado.</p>}
    {h.meeting_at ? <>
      <p><strong>Lugar:</strong> {h.location}</p>
      <p><strong>Fecha y hora:</strong> {peruTime(h.meeting_at)} (Perú)</p>
      {h.notes&&<p>Indicaciones: {h.notes}</p>}
      {!h.delivered&&<p className="handoff-state">{h.change_requested?'Cambio solicitado: envía una nueva propuesta.':h.agreed?'Lugar y horario acordados por ambos.':h.proposed_by_you?'Tu propuesta espera la confirmación de la otra persona.':'La otra persona propuso este encuentro; confirma o pide un cambio.'}</p>}
      {!locked&&!h.proposed_by_you&&!h.change_requested&&coordinating&&<>
        {!h.agreed&&<button type="button" disabled={busy} onClick={()=>act('agree')}>Confirmar lugar y horario</button>}
        <button type="button" disabled={busy} onClick={()=>act('request-change')}>Pedir otro lugar u horario</button>
      </>}
    </>:<p>Aún no hay lugar ni horario. Cualquiera de los dos puede proponer el encuentro.</p>}
    {!locked&&coordinating&&<button type="button" disabled={busy} onClick={()=>setEditing(value=>!value)}>{h.meeting_at?'Proponer otro encuentro':'Proponer lugar y horario'}</button>}
    {editing&&!locked&&<form onSubmit={propose}>
      <label>Lugar de encuentro<input required minLength={3} maxLength={200} value={location} onChange={event=>setLocation(event.target.value)}/></label>
      <label>Fecha y hora de Perú<input required type="datetime-local" value={meeting} onChange={event=>setMeeting(event.target.value)}/></label>
      <label>Indicaciones (opcional)<textarea maxLength={500} value={notes} onChange={event=>setNotes(event.target.value)}/></label>
      <p>Elige un lugar seguro. No incluyas contraseñas, datos de tarjetas ni información personal innecesaria.</p>
      <button type="submit" disabled={busy}>Enviar propuesta de encuentro</button>
    </form>}
    {error&&<p role="alert">{error}</p>}
    {h.agreed&&!operation.payment_simulation?.completed&&operation.finance_enabled&&<p>Encuentro acordado. Revisa el cargo de servicio y el total en «Pagos y constancias», o abre la burbuja de pago del chat.</p>}
    {h.agreed&&!operation.payment_simulation?.completed&&!operation.finance_enabled&&<div className="payment-pilot">
      <p><strong>Encuentro acordado → Pago simulado pendiente.</strong> No se cobra dinero ni se retiene garantía.</p>
      {operation.payment_quote&&<p>Total de uso simulado: S/ {operation.payment_quote.amount} · {operation.payment_quote.unit_count} unidad(es). En alquiler se redondea hacia arriba por la unidad acordada; la garantía no está incluida ni se cobra.</p>}
      {!h.is_owner&&onPayment&&<button type="button" disabled={busy} onClick={()=>setConfirm('payment')}>Continuar al pago simulado</button>}
      {h.is_owner&&<p>El solicitante debe completar la simulación antes de confirmar la entrega.</p>}
    </div>}
    {operation.payment_simulation?.completed&&<p>Pago simulado completado · No se realizó ningún cobro real.</p>}
    {h.delivered&&h.delivered_at&&<p role="status">Entrega registrada el {peruTime(h.delivered_at)} (Perú).</p>}
    {operation.status==='Lista para entrega'&&h.agreed&&operation.payment_simulation?.completed&&!h.delivered&&h.otp_required&&
      <DeliveryCode operation={operation} busy={busy} onAction={onAction} onRefresh={onRefresh} onIncident={report} onCancel={onCancel}/>}
    {h.agreed&&operation.payment_simulation?.completed&&!h.delivered&&!h.otp_required&&<>
      <p>{h.your_delivery_confirmed?'Ya confirmaste tu parte. Esperando a la otra persona.':h.other_delivery_confirmed?'La otra persona ya confirmó; falta tu confirmación.':'Después del encuentro, ambos deben confirmar la entrega.'}</p>
      {!h.your_delivery_confirmed&&<button type="button" disabled={busy} onClick={()=>setConfirm('confirm-delivery')}>{h.is_owner?'Confirmar que entregué el artículo':'Confirmar que recibí el artículo'}</button>}
    </>}
    {h.delivered&&h.otp_required&&<ReturnPanel operation={operation} busy={busy} onAction={onAction} token={token}
      onRefresh={onRefresh} onIncident={report} coordinationHref={coordinationHref} movementsHref={movementsHref}/>}
    {h.delivered&&!h.returned&&operation.modality!=='Venta'&&!h.otp_required&&<>
      <p>{h.your_return_confirmed?'Ya confirmaste la devolución. Esperando a la otra persona.':'Al devolver el artículo, ambos deben confirmar. La fecha de fin por sí sola no lo marca como devuelto.'}</p>
      {!h.your_return_confirmed&&<button type="button" disabled={busy} onClick={()=>setConfirm('confirm-return')}>{h.is_owner?'Confirmar que recibí la devolución':'Confirmar que devolví el artículo'}</button>}
    </>}
    {confirm&&<div role="dialog" aria-label="Confirmar entrega o devolución">
      <p>{confirm==='payment'?'Confirmas una prueba académica sin cobro, tarjeta ni custodia de garantía.':confirm==='confirm-delivery'?'Confirma solo si el artículo ya fue entregado físicamente.':'Confirma solo si el artículo ya fue devuelto físicamente.'} La declaración quedará registrada.</p>
      <button type="button" disabled={busy} onClick={()=>{if(confirm==='payment'){onPayment();setConfirm(null);}else act(confirm);}}>{confirm==='payment'?'Confirmar simulación sin cobro':`Sí, confirmar ${confirm==='confirm-delivery'?'entrega':'devolución'}`}</button>
      <button type="button" disabled={busy} onClick={()=>setConfirm(null)}>Volver</button>
    </div>}
  </section>;
}
