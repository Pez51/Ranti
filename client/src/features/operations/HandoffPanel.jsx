import { useState } from 'react';

export default function HandoffPanel({ operation, busy, onAction, onPayment }) {
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
    if(!meeting||location.trim().length<3){setError('Indica lugar, fecha y hora de Perú.');return;}
    if(deliveryBefore&&new Date(`${meeting}:00-05:00`)>=deliveryBefore){setError('La entrega debe ser antes del inicio del alquiler o préstamo. Elige un horario anterior.');return;}
    onAction({action:'propose',revision:h.revision,location:location.trim(),meeting_at:new Date(`${meeting}:00-05:00`).toISOString(),notes});
    setEditing(false);
  }
  function act(action){onAction({action,revision:h.revision});setConfirm(null);}
  return <section className="handoff-panel" aria-label="Coordinación de entrega">
    <h3>{h.returned?'Devolución confirmada':h.delivered?(operation.modality==='Venta'?'Vendido · Entrega confirmada':operation.modality==='Alquiler'?'Alquilado · En uso':'Prestado · En uso'):'Coordinar entrega'}</h3>
    <p>Registro del piloto: estas confirmaciones no acreditan pagos, seguros ni custodia de garantías.</p>
    {coordinating&&<p>El calendario es opcional. Pueden acordar la entrega por chat y registrar aquí el lugar y la hora.</p>}
    {coordinating&&deliveryBefore&&<p>Entrega antes del {deliveryBefore.toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú), cuando empieza el período solicitado.</p>}
    {h.meeting_at ? <>
      <p><strong>Lugar:</strong> {h.location}</p>
      <p><strong>Fecha y hora:</strong> {new Date(h.meeting_at).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú)</p>
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
    {h.agreed&&!operation.payment_simulation?.completed&&<div className="payment-pilot">
      <p><strong>Encuentro acordado → Pago simulado pendiente.</strong> No se cobra dinero ni se retiene garantía.</p>
      {operation.payment_quote&&<p>Total de uso simulado: S/ {operation.payment_quote.amount} · {operation.payment_quote.unit_count} unidad(es). En alquiler se redondea hacia arriba por la unidad acordada; la garantía no está incluida ni se cobra.</p>}
      {!h.is_owner&&onPayment&&<button type="button" disabled={busy} onClick={()=>setConfirm('payment')}>Continuar al pago simulado</button>}
      {h.is_owner&&<p>El solicitante debe completar la simulación antes de confirmar la entrega.</p>}
    </div>}
    {operation.payment_simulation?.completed&&<p>Pago simulado completado · No se realizó ningún cobro real.</p>}
    {h.agreed&&operation.payment_simulation?.completed&&!h.delivered&&<>
      <p>{h.your_delivery_confirmed?'Ya confirmaste tu parte. Esperando a la otra persona.':h.other_delivery_confirmed?'La otra persona ya confirmó; falta tu confirmación.':'Después del encuentro, ambos deben confirmar la entrega.'}</p>
      {!h.your_delivery_confirmed&&<button type="button" disabled={busy} onClick={()=>setConfirm('confirm-delivery')}>{h.is_owner?'Confirmar que entregué el artículo':'Confirmar que recibí el artículo'}</button>}
    </>}
    {h.delivered&&!h.returned&&operation.modality!=='Venta'&&<>
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
