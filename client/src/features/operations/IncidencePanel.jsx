import { useEffect,useId,useRef,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { preparePhoto } from '../../lib/prepare-photo';
import { incidenceReasonLabels } from '../../lib/incidence-labels';
import { decimalCents } from '../../lib/decimal-cents';
import { downloadEvidence } from './operation-evidence';
import { peruLocalToIso, peruTime } from './operation-time';
const decisions={record_only:'Registrar resolución sin cambiar la operación',continue_operation:'Continuar con las condiciones acordadas',cancel_operation:'Cancelar operación sin pagos ni entrega',settle_guarantee:'Resolver el reparto de garantía',refund_payment:'Registrar devolución del pago de prueba'};
const reportNeedsEvidence = new Set(['delivery_absence', 'delivery_not_validated', 'guarantee', 'money_not_received']);
const reportNeedsDate = new Set(['delivery_absence', 'delivery_not_validated', 'money_not_received']);
const evidenceTypes = 'image/jpeg,image/png,image/webp,application/pdf';
const movementNames = { payout: 'Abono al oferente', refund: 'Devolución del pago', guarantee: 'Movimiento de garantía' };
const emptyDecision = { body: '', action: 'review', decision: 'record_only', target: '', retention: '0.00', guaranteeOutcome: '', refundAmount: '' };
function readDecision(key) {
 try { return { ...emptyDecision, ...JSON.parse(sessionStorage.getItem(key) || '{}') }; }
 catch { return emptyDecision; }
}
function prepareFiles(files){
 return Promise.all(files.map(async file=>{
  const pdf=file.type==='application/pdf';if(pdf&&file.size>5*1024*1024)throw new Error('El PDF debe pesar como máximo 5 MB.');
  return {name:file.name,blob:pdf?file:await preparePhoto(file)};
 }));
}
async function uploadFiles(base,id,files,token){
 for(const {name,blob} of files){
  await apiRequest(`${base}/${id}/evidence`,{token,method:'POST',headers:{'Content-Type':blob.type,'X-File-Name':encodeURIComponent(name)},body:blob});
 }
}
export function IncidenceCase({id,token,admin=false,onChanged}){
 const base=admin?'/admin/incidences':'/incidences';
 const draftKey=`ranti:incidence-decision:${id}`;
 const [draft]=useState(()=>admin?readDecision(draftKey):emptyDecision);
 const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [body,setBody]=useState(draft.body),[action,setAction]=useState(draft.action),[decision,setDecision]=useState(draft.decision),[target,setTarget]=useState(draft.target);
 const [files,setFiles]=useState([]),[notice,setNotice]=useState('');
 const [retention,setRetention]=useState(draft.retention),[confirming,setConfirming]=useState(false);
 const [guaranteeOutcome,setGuaranteeOutcome]=useState(draft.guaranteeOutcome);
 const [checkedDecision,setCheckedDecision]=useState(false);
 const [proposedReturn,setProposedReturn]=useState('');
 const [refundAmount,setRefundAmount]=useState(draft.refundAmount);
 const cents=guaranteeOutcome==='dismissed'?'0':decimalCents(retention);
 const splitting=action==='resolve'&&decision==='settle_guarantee'&&Boolean(data?.return_settlement?.proposed);
 const refunding=action==='resolve'&&decision==='refund_payment'&&Boolean(data?.refund_options);
 const refundCents=decimalCents(refundAmount);
 const refundValid=refunding&&refundCents!==null&&BigInt(refundCents)>0n&&
  BigInt(refundCents)<=BigInt(decimalCents(data.refund_options.total))&&
  BigInt(refundCents)>=BigInt(decimalCents(data.refund_options.guarantee));
 const confirmingAmounts=splitting||refunding;
 useEffect(()=>{let current=true;apiRequest(`${base}/${id}`,{token}).then(result=>{if(current)setData(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[base,id,token,revision]);
 async function act(resolve=false){
  if(busy||!body.trim())return;setBusy(true);setError('');setNotice('');
  try{
   const when=!resolve&&proposedReturn?peruLocalToIso(proposedReturn):null;
   const message=when?`Fecha propuesta para devolver: ${peruTime(when)} (Perú).\n${body.trim()}`:body.trim();
   const payload={revision:data.case.revision,body:message,...(resolve?{action,...(action==='resolve'?{decision}:{}),
    ...(splitting?{retention_cents:cents,guarantee_outcome:guaranteeOutcome}:{}),...(refunding?{refund_cents:refundCents}:{}),
    ...(action==='request_information'?{target_id:target}:{} )}:{})};
   const result=await apiRequest(`${base}/${id}/${resolve?'actions':'replies'}`,{token,method:'POST',body:JSON.stringify(payload)});
   setData(result);setBody('');setProposedReturn('');setConfirming(false);setCheckedDecision(false);
   if(resolve){try{sessionStorage.removeItem(draftKey);}catch{/* The browser may disable storage. */}}
   setNotice(resolve?'Actuación administrativa guardada.':'Respuesta guardada.');onChanged?.();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function attach(){
  if(busy||!files.length)return;setBusy(true);setError('');
  try{await uploadFiles(base,id,await prepareFiles(files),token);setFiles([]);setNotice('Evidencias adjuntas.');onChanged?.();}
  catch(e){setError(`${e.message} Los archivos ya subidos se conservan. Revisa la lista antes de reintentar.`);}
  finally{setRevision(v=>v+1);setBusy(false);}
 }
 async function download(file,fromReturn=false){
  const path=fromReturn?(admin?`${base}/${id}/return-evidence/${file.id}`:
   `/operations/${data.operation.id}/return-evidence/${file.id}`):`${base}/${id}/evidence/${file.id}`;
  setError('');try{await downloadEvidence(path,token,file.name);}catch(e){setError(e.message);}
 }
 async function earlier(){
  if(busy)return;setBusy(true);setError('');try{const result=await apiRequest(`${base}/${id}?before=${data.history_before}`,{token});setData(previous=>({...previous,events:[...result.events,...previous.events],history_before:result.history_before}));}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const pending=data&&!['Resuelta','Desestimada'].includes(data.case.status);
 const settlement=data?.return_settlement;
 const held=decimalCents(settlement?.held??'0');
 const buyerRemainder=BigInt(held)-BigInt(cents??0);
 const toMoney=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
 const rentDecisionMissingDestination=splitting&&((buyerRemainder>0n&&!settlement.buyer_destination)||
  (BigInt(cents??0)>0n&&BigInt(held)>0n&&!settlement.owner_destination?.last_four));
 const canReview=Boolean(body.trim())&&!(action==='resolve'&&body.trim().length<10)&&!(action==='request_information'&&!target)&&
  !(splitting&&(!guaranteeOutcome||cents===null||rentDecisionMissingDestination))&&!(refunding&&!refundValid);
 function editDecision(){
  setConfirming(false);
  setCheckedDecision(false);
 }
 function saveDecision(){
  setError('');setNotice('');
  try{
   sessionStorage.setItem(draftKey,JSON.stringify({body,action,decision,target,retention,guaranteeOutcome,refundAmount}));
   setNotice('Borrador de decisión guardado en esta pestaña.');
  }catch{setError('No se pudo guardar el borrador de decisión en esta pestaña.');}
 }
 return <section className="incidence-case" aria-label="Seguimiento de incidencia">
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!data?<>{!error&&<p>Cargando caso…</p>}{error&&<button disabled={busy} onClick={()=>{setError('');setRevision(v=>v+1);}}>Reintentar seguimiento</button>}</>:<>
   <header><h3>Caso {data.case.id.slice(0,8)} · {data.case.status}</h3><button disabled={busy} onClick={()=>{setError('');setRevision(v=>v+1);}}>Actualizar seguimiento</button></header>
   <p>{data.operation.title} · {data.operation.modality} · {data.operation.status}</p>
   <p><strong>{incidenceReasonLabels[data.case.type]||data.case.type}</strong></p><p>{data.case.description}</p>
   {data.case.occurred_at&&<p>Fecha y hora del hecho: {peruTime(data.case.occurred_at)} (Perú).</p>}
   {data.case.movement_reference&&<p>Referencia del movimiento: {data.case.movement_reference}</p>}
   {data.movement&&<p>{movementNames[data.movement.kind]} · S/ {data.movement.amount} · Registro del {peruTime(data.movement.sent_at)} (Perú).</p>}
   <p className="incidence-effect" role="status">{data.effect.money_notice}</p>
   {data.effect.closure_blocked&&<p>Cierre bloqueado · {data.effect.pending_count} caso(s) pendiente(s).</p>}
   {data.case.response_requested_from&&<p>Administración espera respuesta del {data.case.response_requested_from===data.operation.owner_id?'oferente':'comprador o solicitante'}.</p>}
   {data.case.resolution_action&&<p><strong>Decisión registrada:</strong> {decisions[data.case.resolution_action]}. {data.case.resolution_notes}</p>}
   {data.case.guarantee_outcome&&<p>{data.case.guarantee_outcome==='dismissed'?'Pretensión de garantía desestimada.':'Pretensión de garantía resuelta a favor del oferente.'}</p>}
   {settlement&&<section aria-label="Acta y fotos de la devolución">
    <h4>Acta de devolución</h4>
    {settlement.return_at&&<p>Devolución: {peruTime(settlement.return_at)} (Perú) · {settlement.return_location}</p>}
    {settlement.return_notes&&<p>{settlement.return_notes}</p>}
    {settlement.inspected_at&&<p>Recepción e inspección: {peruTime(settlement.inspected_at)} (Perú).</p>}
    {settlement.inspection_notes&&<p>{settlement.inspection_notes}</p>}
    {data.return_evidence?.map(file=><button key={file.id} type="button" disabled={busy} onClick={()=>download(file,true)}>
     {file.phase==='return'?'Devolución':'Inspección'} · Descargar {file.name}
    </button>)}
   </section>}
   {settlement?.decided&&<p>Garantía de prueba resuelta. Devolución al comprador S/ {settlement.decided.buyer}. Parte del oferente S/ {settlement.decided.owner}. Referencia {settlement.reference}.</p>}
   {data.refund&&<p>Devolución del pago de prueba S/ {data.refund.amount}. Referencia {data.refund.reference}.</p>}
   <h4>Historial</h4>{data.history_before&&<button disabled={busy} onClick={earlier}>Ver actuaciones anteriores</button>}
   <ol className="incidence-history">{data.events.map(event=><li key={event.id}><strong>{event.actor_name||'Participante'}{event.actor_role==='Administrador'?' · Administración':''}</strong><time>{peruTime(event.created_at)}</time><p>{event.body}</p><small>{event.status}{event.decision?` · ${decisions[event.decision]}`:''}</small></li>)}</ol>
   <h4>Evidencias privadas ({data.evidence.length}/5)</h4>
   {data.evidence.map(file=><button key={file.id} disabled={busy} onClick={()=>download(file)}>Descargar {file.name}</button>)}
   {!data.evidence.length&&<p>Aún no hay archivos adjuntos.</p>}
   {pending&&<fieldset disabled={busy}>
    <label>Evidencias (fotos o PDF)<input key={revision} type="file" multiple accept={evidenceTypes} onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>
    <small>Hasta cinco archivos por caso. Fotos: máximo 2 MB después de ajustar; PDF: máximo 5 MB. Solo las partes y administración pueden descargarlos.</small>
    <button type="button" disabled={!files.length||files.length+data.evidence.length>5} onClick={attach}>Adjuntar evidencias</button>
    {!admin&&data.case.type==='late_return'&&<label>Fecha propuesta para devolver (Perú)
     <input type="datetime-local" value={proposedReturn} onChange={e=>setProposedReturn(e.target.value)}/>
     <small>La propuesta sirve para coordinar. El fin pactado del alquiler se mantiene.</small>
    </label>}
    <label>Respuesta o información del caso<textarea maxLength={proposedReturn?2800:3000} value={body} onChange={e=>{setBody(e.target.value);editDecision();}}/></label>
    <button type="button" disabled={!body.trim()} onClick={()=>act()}>Enviar respuesta</button>
    {admin&&<div className="incidence-admin-actions">
     <label>Actuación<select value={action} onChange={e=>{setAction(e.target.value);editDecision();}}><option value="review">Pasar a revisión</option><option value="request_information">Solicitar información</option><option value="resolve">Resolver caso</option></select></label>
     {action==='request_information'&&<label>Solicitar respuesta a<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Selecciona participante</option><option value={data.operation.owner_id}>Oferente</option><option value={data.operation.requester_id}>Comprador o solicitante</option></select></label>}
     {action==='resolve'&&<><label>Decisión<select value={decision} onChange={e=>{setDecision(e.target.value);editDecision();}}>{Object.entries(decisions).filter(([key])=>
      (key!=='settle_guarantee'||settlement?.proposed&&!settlement.decided)&&(key!=='refund_payment'||data.refund_options)
     ).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {splitting?<div>
       <p>Garantía registrada en la prueba S/ {settlement.held}. Propuesta del oferente S/ {settlement.proposed.owner}.</p>
       <label>¿Procede la pretensión de garantía?<select value={guaranteeOutcome} onChange={e=>{setGuaranteeOutcome(e.target.value);editDecision();}}>
        <option value="">Selecciona el resultado</option><option value="proceeds">Procede</option><option value="dismissed">No procede</option>
       </select></label>
       <label>Importe aprobado para el oferente (S/)<input value={guaranteeOutcome==='dismissed'?'0.00':retention} disabled={guaranteeOutcome==='dismissed'} inputMode="decimal" onChange={e=>{setRetention(e.target.value);editDecision();}}/></label>
       {guaranteeOutcome&&cents!==null&&<dl>
        <dt>Tipo de devolución</dt><dd>{BigInt(cents)===0n?'Total':buyerRemainder>0n?'Parcial':'Sin saldo'}</dd>
        <dt>Al comprador · {settlement.buyer_destination||'Destino por verificar'}</dt><dd>S/ {toMoney(buyerRemainder>0n?buyerRemainder:0n)}</dd>
        <dt>Al oferente · {settlement.owner_destination? `${settlement.owner_destination.label} •••• ${settlement.owner_destination.last_four}`:'Destino por verificar'}</dt><dd>S/ {toMoney(buyerRemainder>=0n?BigInt(cents):BigInt(held))}</dd>
        {buyerRemainder<0n&&<><dt>Exceso sin cobro automático</dt><dd>S/ {toMoney(-buyerRemainder)}</dd></>}
       </dl>}
       {rentDecisionMissingDestination&&<p role="status">Falta verificar el destino de un importe a devolver.</p>}
       <p>El alquiler se liquida en un movimiento separado. Los importes quedan sujetos a confirmación de cada movimiento.</p>
      </div>:refunding?<div>
       <p>Saldo reembolsable del pago de prueba S/ {data.refund_options.total}. Destino {data.refund_options.destination||'medio original'}.</p>
       {data.refund_options.before_delivery&&<p>La decisión cancela la operación y libera la reserva. Incluye la garantía registrada de S/ {data.refund_options.guarantee}.</p>}
       <label>Importe que se devuelve (S/)<input inputMode="decimal" value={refundAmount} onChange={event=>{setRefundAmount(event.target.value);editDecision();}}/></label>
       {refundValid&&<p>Devolución {refundCents===decimalCents(data.refund_options.total)?'total':'parcial'} de S/ {toMoney(BigInt(refundCents))} al comprador.</p>}
      </div>:<p>Resolver no ejecuta reembolsos, cobros ni transferencias. La cancelación solo se permite sin pagos registrados, entrega ni otros casos pendientes.</p>}
     </>}
     {confirming&&confirmingAmounts&&<div role="group" aria-label="Confirmar resolución y destinos">
      <h4>Confirmar resolución y destinos</h4>
      <p>Motivación: {body.trim()}</p>
      <p>Los movimientos todavía no se han ordenado.</p>
      <label><input type="checkbox" checked={checkedDecision} onChange={e=>setCheckedDecision(e.target.checked)}/> Revisé los importes, las evidencias y los destinos.</label>
      <button type="button" onClick={editDecision}>Volver a editar la decisión</button>
     </div>}
     {action==='resolve'&&!confirming&&<button type="button" onClick={saveDecision}>Guardar borrador de decisión</button>}
     <button disabled={!canReview||(confirming&&confirmingAmounts&&!checkedDecision)}
      onClick={()=>confirmingAmounts&&!confirming?setConfirming(true):act(true)}>{confirmingAmounts?confirming?'Confirmar importes y destinos de prueba':'Revisar resolución y destinos':'Guardar actuación administrativa'}</button>
    </div>}
   </fieldset>}
  </>}
 </section>;
}
export default function IncidencePanel({operationId,token,initialOpen=false,request=null,onChanged=null}){
 const [open,setOpen]=useState(initialOpen||Boolean(request)),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [reason,setReason]=useState(request?.caseId?'':request?.reason||''),[description,setDescription]=useState('');
 const [selected,setSelected]=useState(request?.caseId||null),[revision,setRevision]=useState(0);
 const [occurredAt,setOccurredAt]=useState(''),[reportFiles,setReportFiles]=useState([]);
 const [movement,setMovement]=useState(request?.movement||'');
 const section=useRef(null);
 const evidenceHint=useId();
 const requested=Boolean(request);
 const needsEvidence=reportNeedsEvidence.has(reason);
 const needsDate=reportNeedsDate.has(reason);
 const failedDelivery=reason==='delivery_absence'||reason==='delivery_not_validated';
 const when=needsDate?peruLocalToIso(occurredAt):null;
 const validReason=Boolean(data?.policy.reasons?.some(item=>item.id===reason));
 const movements=data?.movements??[];
 const validMovement=movements.some(item=>item.reference===movement);
 const canReport=validReason&&description.trim().length>=10&&(!needsDate||when)&&
  (!needsEvidence||reportFiles.length>0&&reportFiles.length<=5)&&(reason!=='money_not_received'||validMovement);
 useEffect(()=>{if(requested)section.current?.focus();},[requested]);
 useEffect(()=>{if(!open)return;let current=true;apiRequest(`/operations/${operationId}/incidences`,{token}).then(result=>{if(current)setData(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[operationId,token,open,revision]);
 async function report(event){
  event.preventDefault();
  if(busy||!canReport)return;
  setBusy(true);setError('');
  let caseId=null;
  try{
   const evidence=needsEvidence?await prepareFiles(reportFiles):[];
   const reportData={reason,description:description.trim(),...(when?{occurred_at:when}:{}),
    ...(reason==='money_not_received'?{movement_reference:movement}:{} )};
   const result=await apiRequest(`/operations/${operationId}/incidences`,{token,method:'POST',body:JSON.stringify(reportData)});
   caseId=result.case.id;
   if(evidence.length)await uploadFiles('/incidences',caseId,evidence,token);
  }catch(e){
   setError(caseId?`El expediente ya está abierto. ${e.message} Revisa sus adjuntos y agrega los archivos pendientes desde el seguimiento.`:e.message);
  }finally{
   if(caseId){
    setSelected(caseId);setDescription('');setReason('');setOccurredAt('');setReportFiles([]);setMovement('');
    setRevision(v=>v+1);onChanged?.();
   }
   setBusy(false);
  }
 }
 return <section className="operation-incidences" ref={section} tabIndex={-1}>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Ocultar incidencias':'Reportar un problema'}</button>
  {open&&<><h3>Problemas y seguimiento</h3>{error&&<p role="alert">{error}</p>}{!data?<>{!error&&<p>Cargando incidencias…</p>}{error&&<button onClick={()=>{setError('');setRevision(v=>v+1);}}>Reintentar incidencias</button>}</>:<>
   <p className="incidence-effect">{data.effect.money_notice}</p>
   {data.items.map(item=><button type="button" key={item.id} onClick={()=>setSelected(item.id)}>Caso {item.id.slice(0,8)} · {incidenceReasonLabels[item.type]||item.type} · {item.status}</button>)}
   {requested&&reason&&!validReason&&<p role="status">El motivo seleccionado no está disponible en el estado actual de la operación.</p>}
   {data.policy.allowed?<form onSubmit={report}><fieldset disabled={busy}>
    {failedDelivery&&<><h4>Reportar incumplimiento de entrega</h4>
     {request?.meetingAt&&<p>Encuentro acordado: {request.meetingLocation} · {peruTime(request.meetingAt)} (Perú).</p>}
     <p>Administración verificará el incumplimiento y resolverá cualquier cancelación y devolución aplicable al pago original.</p></>}
    {reason==='money_not_received'&&<><h4>Reportar dinero no recibido</h4>
     <p>Se abrirá una revisión del movimiento y podrás consultar el avance en el expediente.</p>
     <label>Movimiento que no recibiste<select required value={validMovement?movement:''} onChange={e=>setMovement(e.target.value)}>
      <option value="">Selecciona el movimiento</option>
      {movements.map(item=><option key={item.reference} value={item.reference}>{movementNames[item.kind]} · S/ {item.amount} · {item.reference}</option>)}
     </select></label></>}
    {reason==='paid_cancellation'&&<p>Administración revisará la solicitud y el estado del pago confirmado.</p>}
    <label>Motivo del problema<select required value={validReason?reason:''} onChange={e=>{setReason(e.target.value);setReportFiles([]);}}><option value="">Selecciona el motivo</option>{data.policy.reasons.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
    {needsDate&&<label>Fecha y hora del hecho (Perú)<input required type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></label>}
    <label>Describe lo ocurrido<textarea required minLength={10} maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    {needsEvidence?<label>Evidencia del reporte
     <input key={reason} type="file" multiple accept={evidenceTypes} aria-required="true" aria-describedby={evidenceHint} onChange={e=>setReportFiles(Array.from(e.target.files||[]))}/>
    </label>:<small>Al abrir el caso podrás adjuntar fotos o PDF. Ambas partes podrán aportar información; solo administración puede resolverlo.</small>}
    {needsEvidence&&<small id={evidenceHint}>Adjunta hasta cinco fotos o PDF. Solo las partes y administración tienen acceso.</small>}
    <button disabled={!canReport}>{busy?'Registrando…':failedDelivery?'Enviar reporte de incumplimiento':reason==='money_not_received'?'Enviar reporte de no recepción':'Abrir incidencia'}</button>
   </fieldset></form>:<p>No se admiten nuevos reportes en este estado o fuera del plazo.</p>}
   <p>Puedes reportar hasta {data.policy.post_close_days} días después del cierre.{data.policy.report_deadline?` Plazo hasta ${peruTime(data.policy.report_deadline)} (Perú).`:''}</p>
  </>}{selected&&<IncidenceCase key={`${selected}-${token}`} id={selected} token={token} onChanged={()=>{setRevision(v=>v+1);onChanged?.();}}/>}</>}
 </section>;
}
