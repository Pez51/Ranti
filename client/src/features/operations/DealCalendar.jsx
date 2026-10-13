import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import HandoffPanel from './HandoffPanel';

const time=date=>new Date(date).toLocaleTimeString('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',hour12:false});
const dayLabel=date=>new Date(`${date}T12:00:00-05:00`).toLocaleDateString('es-PE',{weekday:'short',day:'numeric',month:'short',timeZone:'America/Lima'});
export default function DealCalendar({deal,token,defaultOpen=false,onSaved}){
  const [open,setOpen]=useState(defaultOpen),[calendar,setCalendar]=useState(null),[operation,setOperation]=useState(null),[slots,setSlots]=useState([]),[location,setLocation]=useState('Dentro de la UCSM — lugar por precisar');
  const [day,setDay]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [rangeStart,setRangeStart]=useState(''),[rangeEnd,setRangeEnd]=useState('');
  const [savedMessage,setSavedMessage]=useState('');
  const dirty=useRef(false),alive=useRef(true);
  useEffect(()=>{
    if(!open)return;alive.current=true;const controller=new AbortController();let active=true;
    async function load(){
      if(document.hidden)return;
      try{
        const [c,o]=await Promise.all([apiRequest(`/operations/${deal.id}/calendar`,{token,signal:controller.signal}),apiRequest(`/operations/${deal.id}`,{token,signal:controller.signal})]);
        if(active){setCalendar(c);setOperation(o.operation);if(!dirty.current){setSlots(c.slots);setLocation(c.location_preference);}}
      }catch(e){if(active&&e.name!=='AbortError')setError(e.message);}
    }
    load();const timer=setInterval(load,45000);
    return()=>{active=false;alive.current=false;controller.abort();clearInterval(timer);};
  },[open,deal.id,deal.status,token]);
  async function refresh(){
    try{const [c,o]=await Promise.all([apiRequest(`/operations/${deal.id}/calendar`,{token}),apiRequest(`/operations/${deal.id}`,{token})]);if(alive.current){setCalendar(c);setOperation(o.operation);if(!dirty.current){setSlots(c.slots);setLocation(c.location_preference);}}}catch(e){setError(e.message);}
  }
  async function save(skipped=false){
    if(busy)return;setBusy(true);setError('');setSavedMessage('');
    const future=slots.filter(slot=>new Date(slot)>new Date(calendar.server_now));
    try{const c=await apiRequest(`/operations/${deal.id}/calendar`,{token,method:'POST',body:JSON.stringify({revision:calendar.revision,skipped,slots:skipped?[]:future,location_preference:location})});if(alive.current){dirty.current=false;setCalendar(c);setSlots(c.slots);const message=skipped?'Calendario omitido. Pueden coordinar la entrega por chat.':'Tus horarios se guardaron correctamente. Aún deben acordar y confirmar el encuentro.';setSavedMessage(message);onSaved?.(message);}}
    catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
  }
  async function coordinate(body,payment=false){
    if(busy)return;setBusy(true);setError('');
    try{const result=await apiRequest(`/operations/${deal.id}/${payment?'payment-simulation':'handoff'}`,{token,method:'POST',body:JSON.stringify(body)});if(alive.current){setOperation(result.operation);await refresh();}}
    catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
  }
  let days=[],available=[];
  if(calendar){
    const first=new Date(calendar.accepted_at).getTime()-5*3600000;
    const start=new Date(`${new Date(first).toISOString().slice(0,10)}T00:00:00-05:00`).getTime();
    for(let index=0;index<8;index++){
      const date=new Date(start+index*86400000-5*3600000).toISOString().slice(0,10);
      const values=[];
      for(let half=0;half<48;half++){
        const instant=start+index*86400000+half*1800000;
        if(instant>=new Date(calendar.accepted_at).getTime()&&instant>new Date(calendar.server_now).getTime()&&instant+1800000<=new Date(calendar.window_end).getTime())values.push(new Date(instant).toISOString());
      }
      if(values.length)days.push({date,values});
    }
    available=(days.find(item=>item.date===day)||days[0])?.values||[];
  }
  const ends=available.map(slot=>new Date(new Date(slot).getTime()+1800000).toISOString());
  const from=available.includes(rangeStart)?rangeStart:available[0]||'';
  const until=ends.includes(rangeEnd)?rangeEnd:ends[0]||'';
  const range=available.filter(slot=>slot>=from&&slot<until);
  const recommendationDays=Object.groupBy(calendar?.recommendations.slice(0,12)||[],slot=>new Date(new Date(slot.start).getTime()-5*3600000).toISOString().slice(0,10));
  function mark(values,remove=false){
    dirty.current=true;
    setSlots(previous=>remove?previous.filter(slot=>!values.includes(slot)):[...new Set([...previous,...values])].sort());
  }
  return <section className="deal-calendar" aria-label="Calendario y entrega del trato">
    <h2>{deal.status==='Cancelada'?'Trato cancelado':deal.status==='Cerrada'?'Trato finalizado':'Trato aceptado'} · {deal.modality}</h2><p>Operación {deal.id.slice(0,8)} · {operation?.status==='Pendiente de pago/garantía'?'Encuentro acordado · Pago simulado pendiente':operation?.status||deal.status}</p>
    <button type="button" disabled={busy} onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'Ocultar calendario y coordinación':'Abrir calendario y coordinar entrega'}</button>
    {open&&<>
      {error&&<p role="alert">{error}</p>}
      {savedMessage&&<p role="status">{savedMessage}</p>}
      {!calendar&&<p>Cargando calendario…</p>}
      {calendar&&<>
        <section className="calendar-step" aria-label="1. Tus horarios">
        <header className="calendar-step-heading"><span>1</span><div><h3>Tus horarios</h3><p>Marca cuándo puedes entregar o recibir el artículo.</p></div></header>
        <p><strong>Calendario opcional.</strong> Si no logran coordinar por chat, úsenlo para encontrar horarios en común. También pueden omitirlo y registrar directamente el lugar y la hora acordados abajo.</p>
        <p>Franjas de 30 minutos desde la aceptación y por un máximo de 7 días, hasta {new Date(calendar.window_end).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú). No asumimos horarios de apertura de la universidad.</p>
        {calendar.delivery_before&&<p><strong>La entrega debe ser antes del inicio del alquiler o préstamo:</strong> {new Date(calendar.delivery_before).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú). El calendario solo ofrece horarios anteriores.</p>}
        <label>Lugar preferido<input maxLength={200} value={location} disabled={busy||!calendar.editable} onChange={event=>{dirty.current=true;setLocation(event.target.value);}}/></label>
        {calendar.editable&&<>
          <div className="calendar-days" role="group" aria-label="Días disponibles">{days.map(item=><button key={item.date} type="button" aria-pressed={item.date===(day||days[0]?.date)} onClick={()=>{setDay(item.date);setRangeStart('');setRangeEnd('');}}>{dayLabel(item.date)}</button>)}</div>
          <fieldset className="calendar-range" disabled={busy||!available.length}>
            <legend>Seleccionar varias horas de una vez</legend>
            <p>Elige un rango para este día. Puedes añadir varios rangos sin borrar los anteriores.</p>
            <div className="calendar-range-fields">
              <label>Desde<select value={from} onChange={event=>setRangeStart(event.target.value)}>{available.map(slot=><option key={slot} value={slot}>{time(slot)}</option>)}</select></label>
              <label>Hasta<select value={until} onChange={event=>setRangeEnd(event.target.value)}>{ends.map(slot=><option key={slot} value={slot}>{time(slot)}{time(slot)==='00:00'?' (día siguiente)':''}</option>)}</select></label>
              <button type="button" disabled={!range.length} onClick={()=>mark(range)}>Marcar rango</button>
              <button type="button" disabled={!range.length} onClick={()=>mark(range,true)}>Quitar rango</button>
            </div>
            {available.length>0&&!range.length&&<p role="status">Elige una hora de fin posterior al inicio.</p>}
            <button type="button" onClick={()=>mark(available)}>Marcar todo el día disponible</button>
            <button type="button" onClick={()=>mark(available,true)}>Limpiar este día</button>
          </fieldset>
          <div className="calendar-slots" role="group" aria-label="Franjas disponibles">{available.map(slot=><label key={slot}><input type="checkbox" checked={slots.includes(slot)} disabled={busy} onChange={event=>{dirty.current=true;setSlots(previous=>event.target.checked?[...previous,slot]:previous.filter(value=>value!==slot));}}/>{time(slot)}–{time(new Date(new Date(slot).getTime()+1800000))}</label>)}</div>
          <div className="calendar-save-bar"><p><strong>{slots.length} franjas marcadas</strong><span>Guarda para comparar con la otra persona.</span></p><button className="calendar-primary" disabled={busy} onClick={()=>save(false)}>Guardar mis horarios</button></div>
          <div className="calendar-skip"><span>¿Prefieren acordarlo directamente?</span><button disabled={busy} onClick={()=>save(true)}>Omitir calendario y coordinar por chat</button></div>
        </>}
        {!calendar.editable&&<p>El calendario terminó o el encuentro ya fue acordado. Puedes consultar y coordinar manualmente abajo.</p>}
        </section>
        <section className="calendar-step" aria-label="2. Horarios en común">
        <header className="calendar-step-heading"><span>2</span><div><h3>Horarios en común</h3><p>Coincidencias guardadas, de la más cercana a la más lejana.</p></div><button disabled={busy} onClick={refresh}>Actualizar coincidencias y acuerdo</button></header>
        {calendar.skipped||calendar.other_skipped?<p className="calendar-empty">Uno de los participantes omitió el calendario. Acuerden lugar y hora por chat y registren el encuentro abajo.</p>:!calendar.other_submitted?<p className="calendar-empty">Esperando que la otra persona marque sus horarios.</p>:calendar.recommendations.length===0?<p className="calendar-empty">No hay coincidencias futuras guardadas. Ajusten sus horarios o coordinen manualmente por chat.</p>:<div className="calendar-recommendations"><p className="calendar-place"><strong>Lugar sugerido</strong><span>{calendar.location_suggestion}</span><small>Precisen el punto exacto antes de confirmar.</small></p>
          {Object.entries(recommendationDays).map(([date,values])=><section className="calendar-recommendation-day" key={date} aria-label={dayLabel(date)}><h4>{dayLabel(date)}</h4><div className="calendar-recommendation-grid">{values.map(slot=><article key={slot.start} className="calendar-time-card"><strong>{time(slot.start)}–{time(slot.end)}</strong><span>Hora de Perú</span><button type="button" aria-label={`Proponer ${dayLabel(date)} de ${time(slot.start)} a ${time(slot.end)}`} disabled={busy||!calendar.editable} onClick={()=>coordinate({action:'propose',revision:operation.handoff.revision,meeting_at:slot.start,location,notes:'Encuentro propuesto a partir de una coincidencia del calendario. Precisar el punto exacto por chat.'})}>Proponer este horario</button></article>)}</div></section>)}
          {calendar.recommendations.length>12&&<p>Hay {calendar.recommendations.length} coincidencias; se muestran las 12 más próximas.</p>}
        </div>}
        </section>
      </>}
      {operation&&<section className="calendar-step calendar-meeting" aria-label="3. Encuentro y entrega"><header className="calendar-step-heading"><span>3</span><div><h3>Encuentro y entrega</h3><p>Revisen la propuesta y confirmen juntos el lugar y la hora.</p></div></header><HandoffPanel key={`${operation.id}-${operation.handoff.revision}`} operation={operation} busy={busy} onAction={body=>coordinate(body)} onPayment={()=>coordinate({confirm_simulation:true},true)}/></section>}
    </>}
  </section>;
}
