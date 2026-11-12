import { useEffect,useRef,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { downloadFinanceDocument } from '../../lib/finance-documents';
import DemoCardFields from '../dashboard/DemoCardFields';
import FinanceDocumentPreview from './FinanceDocumentPreview';
const statuses={pending:'Pendiente de confirmación',failed:'Fallido',simulated_succeeded:'Simulación completada — sin dinero real',sandbox_succeeded:'Confirmado en Culqi sandbox — sin dinero real'};
const failureReasons={declined:'El canal rechazó este intento.',authorization_rejected:'Se rechazó la autorización de prueba.',
 authorization_expired:'La autorización de prueba venció.',not_executed:'La conciliación verificó que el intento no se ejecutó.'};
const refundCauses={paid_cancellation:'Cancelación antes de la entrega',delivery_absence:'Ausencia en la entrega',
 delivery_not_validated:'Entrega sin validar',not_as_described:'Artículo distinto a lo acordado',
 damage:'Daño reportado',meeting:'Incidencia en el encuentro',payment:'Incidencia de pago'};
const isPaid=payment=>['simulated_succeeded','sandbox_succeeded'].includes(payment?.status);
const peruDate=value=>new Date(value).toLocaleString('es-PE',{timeZone:'America/Lima'});
const missingMoneyLink=(operationId,reference)=>`/operaciones/${operationId}?incidence=money_not_received&movement=${encodeURIComponent(reference)}`;
export default function FinancePanel({operationId,token,owner=false,defaultOpen=false,onCompleted}){
 const [open,setOpen]=useState(defaultOpen),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [selectedMethod,setMethod]=useState(null),[accepted,setAccepted]=useState(''),[source,setSource]=useState(''),[scenario,setScenario]=useState('success');
 const [cardValid,setCardValid]=useState(false),[savedCard,setSavedCard]=useState(false);
 const [preview,setPreview]=useState(null);
 const retryKey=useRef(null);
 useEffect(()=>{
  if(!open)return;const controller=new AbortController();
  apiRequest(`/operations/${operationId}/finance`,{token,signal:controller.signal}).then(setData).catch(e=>{if(e.name!=='AbortError'){setData(null);setError(e.message);}});
  return()=>controller.abort();
 },[open,operationId,token,revision]);
 async function action(work){if(busy)return;setBusy(true);setError('');try{await work();}catch(e){setError(e.message);}finally{setBusy(false);}}
 const methods=data?.methods??[];
 const preferred=methods.some(item=>item.id===data?.preferred_method)?data.preferred_method:null;
 const method=selectedMethod??data?.quote?.method??preferred??methods[0]?.id;
 const cardReady=method!=='tarjeta_prueba'||cardValid||(savedCard&&data?.preferred_method==='tarjeta_prueba');
 function quote(){action(async()=>{const q=await apiRequest(`/operations/${operationId}/finance/quotes`,{token,method:'POST',body:JSON.stringify({method})});setData(previous=>({...previous,quote:q,recipient:q.recipient??previous.recipient}));setAccepted('');setCardValid(false);setSavedCard(false);setSource('');retryKey.current=null;});}
 function pay(){action(async()=>{
  if(!data.quote?.buyer||!cardReady||accepted!==`${data.quote.id}:${data.quote.buyer.total}`)return;
  if(retryKey.current?.quote!==data.quote.id)retryKey.current={quote:data.quote.id,key:crypto.randomUUID()};
  const result=await apiRequest(`/operations/${operationId}/finance/payments`,{token,method:'POST',body:JSON.stringify({quote_id:data.quote.id,idempotency_key:retryKey.current.key,accepted_total:data.quote.buyer.total,confirm_test:true,...(data.quote.mode==='culqi_sandbox'?{source_id:source}:{scenario})})});setData(result);if(isPaid(result.payment))onCompleted?.();
 });}
 function updateAttempt(step,decision){action(async()=>{
  const result=await apiRequest(`/operations/${operationId}/finance/payments/${data.payment.id}/${step}`,
   {token,method:'POST',...(decision?{body:JSON.stringify({decision})}:{})});
  setData(result);
  if(!isPaid(data.payment)&&isPaid(result.payment))onCompleted?.();
 });}
 function document(){action(async()=>{const doc=await apiRequest(`/operations/${operationId}/finance/documents/${owner?'owner':'buyer'}`,{token});downloadFinanceDocument(doc);});}
 function previewDocument(kind){action(async()=>setPreview(await apiRequest(`/operations/${operationId}/finance/documents/${kind}`,{token})));}
 function confirmReceipt(kind){action(async()=>{setData(await apiRequest(`/operations/${operationId}/finance/receipts/${kind}`,{token,method:'POST'}));});}
 const q=data?.quote,a=owner?(q?.owner||data?.owner_estimate):q?.buyer;
 const payment=data?.payment;
 const canQuote=!data?.payment_deadline_passed&&(!payment||data?.can_retry_payment);
 const canPayQuote=canQuote&&q?.method===method&&(!payment||data.attempted_quote_id!==q.id);
 const settlement=data?.settlement;
 const guaranteeAmount=owner?settlement?.decided?.owner:settlement?.decided?.buyer;
 return <section className="operation-finance" aria-label="Pagos y constancias">
  <button type="button" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Ocultar pagos y constancias':'Pagos y constancias'}</button>
  {open&&<><h3>{owner?'Mis movimientos':isPaid(payment)?'Pago de prueba confirmado':payment?.status==='pending'?'Pago en verificación':data?.modality==='Venta'?'Revisa tu compra y elige el pago':'Resumen antes de pagar'}</h3><p><strong>Simulación sin movimiento de dinero real.</strong> Los documentos fiscales son muestras.</p>
   {error&&<p role="alert">{error}</p>}{!data&&!error&&<p>Cargando información económica…</p>}
   {data&&<>
    {payment&&<><p>Pago: {statuses[payment.status]||payment.status} · Referencia: {payment.reference||payment.id}</p>
     {payment.amount&&<p>S/ {payment.amount} · {methods.find(item=>item.id===payment.method)?.label??payment.method}
      {payment.created_at&&` · Inicio ${peruDate(payment.created_at)} (Perú)`}
      {payment.confirmed_at&&` · Confirmado ${peruDate(payment.confirmed_at)} (Perú)`}</p>}</>}
    {data.guarantee_registered&&<section aria-label="Garantía registrada">
      <h4>{owner?'Garantía del alquiler confirmada':'Tu garantía quedó registrada'}</h4>
      <p role="status">S/ {data.guarantee_registered} · Garantía cobrada en la simulación · {payment.reference}.</p>
      <p>El saldo se determina al cerrar la devolución del equipo.</p>
    </section>}
    {payment?.status==='pending'&&!payment.authorization_required&&<section aria-label="Pago en verificación">
     <p>La entrega y los documentos estarán disponibles al confirmar este intento.</p>
     {data.payment_deadline&&<p>Vencimiento de la reserva {peruDate(data.payment_deadline)} (Perú). Si el estado sigue incierto, requiere conciliación.</p>}
     {!owner&&<button disabled={busy} onClick={()=>updateAttempt('consult')}>Consultar este intento</button>}
    </section>}
    {payment?.authorization_required&&!owner&&<section aria-label="Autorización bancaria de prueba">
      <h4>Autoriza el pago en el banco de prueba</h4>
      <p>Tarjeta de prueba •••• 4242 · S/ {payment.amount}. La autorización pasa el intento a verificación.</p>
      <button disabled={busy} onClick={()=>updateAttempt('authorize','approve')}>Autorizar en el banco de prueba</button>
      <button disabled={busy} onClick={()=>updateAttempt('authorize','reject')}>Rechazar autorización</button>
      <button disabled={busy} onClick={()=>updateAttempt('authorize','expired')}>Simular autorización vencida</button>
    </section>}
    {payment?.status==='failed'&&<p role="status">{failureReasons[payment.failure_reason]} {data.can_retry_payment?
     'El intento de prueba no se ejecutó. Puedes revisar una nueva cotización durante la reserva.':
     'El pago no está confirmado. Consulta el estado de la reserva o solicita una revisión del intento.'}</p>}
    {!payment&&data.payment_deadline_passed&&<p role="status">Venció el plazo para pagar esta reserva.</p>}
    {owner&&a&&<><dl><dt>Precio bruto acordado</dt><dd>S/ {a.gross_amount}</dd><dt>Deducción vigente</dt><dd>S/ {a.deduction}</dd><dt>Recibirás (importe neto)</dt><dd>S/ {a.net_amount}</dd>{data.payout&&<><dt>Destino acordado</dt><dd>{data.payout.label} •••• {data.payout.last_four}</dd></>}</dl><p>{a.explanation}</p><p>{data.transfer.status==='confirmed'?`Desembolso registrado · ${data.transfer.reference}`:`Transferencia: no habilitada. ${data.transfer.condition}`}</p>{data.transfer.blocked_reason&&<p>Estado actual: {data.transfer.blocked_reason}</p>}</>}
    {owner&&data.transfer.simulated&&<section aria-label="Abono del precio">
     <h4>Abono de la {data.modality==='Venta'?'venta':'tarifa de alquiler'}</h4>
     {data.transfer.confirmed_at&&<p>Registrado el {peruDate(data.transfer.confirmed_at)} (Perú).</p>}
     {data.transfer.received_at?<p role="status">Recepción del abono de prueba confirmada.</p>:<>
      <button disabled={busy} onClick={()=>confirmReceipt('payout')}>Confirmar recepción del abono de prueba</button>
      {data.transfer.reference&&<a href={missingMoneyLink(operationId,data.transfer.reference)}>Reportar que no recibí el abono</a>}
     </>}
    </section>}
    {settlement?.decided&&<section aria-label="Reparto de la garantía de prueba">
     <h4>{owner?'Importe aprobado de la garantía':'Devolución de garantía'}</h4>
     <p>Garantía S/ {settlement.held} · Retención S/ {settlement.decided.owner} · Saldo S/ {settlement.decided.buyer}</p>
     {owner&&<p>Importe de prueba aprobado S/ {guaranteeAmount} · Costo simulado S/ 0.00 · Neto S/ {guaranteeAmount}</p>}
     <p>{settlement.reference} · {peruDate(settlement.decided_at)} (Perú)</p>
     {!owner&&<p>Destino {settlement.buyer_destination}.</p>}
     {settlement.received_at?<p role="status">Recepción del movimiento confirmada.</p>:
      guaranteeAmount!=='0.00'&&<>
       <button disabled={busy} onClick={()=>confirmReceipt('guarantee')}>Confirmar recepción de la garantía de prueba</button>
       <a href={missingMoneyLink(operationId,settlement.reference)}>Reportar que no recibí el movimiento de garantía</a>
      </>}
    </section>}
    {!data.refund&&data.refund_case&&<section aria-label="Seguimiento de reembolso">
      <h4>Seguimiento de reembolso</h4><p>{refundCauses[data.refund_case.type]} · Caso {data.refund_case.status}.</p>
      <a href={`/operaciones/${operationId}?case=${data.refund_case.id}`}>Ver incidencia</a>
    </section>}
    {data.refund&&<section aria-label="Devolución del pago de prueba"><h4>{data.modality==='Venta'?'Reembolso de la compra de prueba':'Devolución del pago de prueba'}</h4>
      {data.refund_case&&<p>Causal: {refundCauses[data.refund_case.type]??data.refund_case.type} · Caso {data.refund_case.id}</p>}
      <p>Reembolso registrado · Importe S/ {data.refund.amount} · Referencia {data.refund.reference}
       {data.refund.created_at&&` · Registrado el ${peruDate(data.refund.created_at)} (Perú)`}</p>
      {!owner&&<><p>Destino {data.refund.destination}.</p>
        {data.refund.received_at?<p role="status">Recepción del reembolso confirmada.</p>:
          <><button disabled={busy} onClick={()=>confirmReceipt('refund')}>Confirmar recepción del reembolso de prueba</button>
           <a href={missingMoneyLink(operationId,data.refund.reference)}>Reportar que no recibí el reembolso</a></>}</>}
    </section>}
    {!owner&&canQuote&&['Pendiente','Aceptada','Pendiente de pago/garantía'].includes(data.operation_status)&&<><label>Medio de pago de prueba<select value={method} disabled={busy} onChange={e=>{setMethod(e.target.value);setAccepted('');setCardValid(false);setSavedCard(false);setSource('');setScenario('success');}}>{methods.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button disabled={busy||!method} onClick={quote}>Calcular y revisar total</button></>}
    {!owner&&a&&<><dl><dt>Precio base del artículo (neto del oferente)</dt><dd>S/ {a.price}</dd><dt>Cargo de servicio</dt><dd>S/ {a.service_charge}</dd><dt>Garantía declarada</dt><dd>S/ {a.guarantee_declared}</dd><dt>Garantía cobrada en esta prueba</dt><dd>S/ {a.guarantee_charged}</dd><dt>Total exacto</dt><dd>S/ {a.total}</dd></dl><p>{a.guarantee_note}</p><p>El precio base y el cargo de servicio reorganizan el precio acordado sin duplicar la comisión. No habrá cargos posteriores.</p>
     {a.commission!==undefined&&<p>Del cargo de servicio, S/ {a.commission} corresponde a la comisión y S/ {a.processor_cost} al procesamiento.</p>}
     {!owner&&canPayQuote&&<>
      {method==='tarjeta_prueba'&&<fieldset disabled={busy}>
       <legend>Autoriza el pago con tarjeta de prueba</legend>
       {data.preferred_method==='tarjeta_prueba'&&<label><input type="checkbox" checked={savedCard} onChange={e=>{setSavedCard(e.target.checked);setCardValid(false);setAccepted('');}}/>Usar tarjeta guardada •••• 4242</label>}
       {!savedCard&&<DemoCardFields key={q.id} onValidity={setCardValid}/>}
      </fieldset>}
      {['yape_prueba','plin_prueba'].includes(method)&&<div>
       <h4>Orden de {method==='yape_prueba'?'Yape':'Plin'} de prueba</h4>
       <p>Importe S/ {a.total} · Referencia {q.id}</p>
       {q.expires_at&&<p>Vence a las {new Date(q.expires_at).toLocaleTimeString('es-PE',{timeZone:'America/Lima'})} (Perú).</p>}
       <p>Referencia para simular la billetera. Un canal contratado definirá su interfaz de pago.</p>
      </div>}
      {data.recipient&&<p>Receptor del documento de prueba: {data.recipient}</p>}
      {q.mode==='culqi_sandbox'?<label>Token de tarjeta de prueba de Culqi<input type="password" autoComplete="off" value={source} onChange={e=>setSource(e.target.value)} placeholder="Token de prueba"/></label>:<label>Escenario de prueba<select value={scenario} onChange={e=>setScenario(e.target.value)}><option value="success">Éxito simulado</option><option value="failed">Fallo simulado</option><option value="pending">Pendiente simulado</option>{method==='tarjeta_prueba'&&<option value="authorization">Requiere autorización bancaria de prueba</option>}</select></label>}
      <label><input type="checkbox" checked={accepted===`${q.id}:${a.total}`} onChange={e=>setAccepted(e.target.checked?`${q.id}:${a.total}`:'')}/>Acepto el total de S/ {a.total} y confirmo que es una prueba.</label>
      <button disabled={busy||!cardReady||accepted!==`${q.id}:${a.total}`||data.operation_status!=='Pendiente de pago/garantía'} onClick={pay}>Confirmar pago de prueba</button>
      {data.operation_status!=='Pendiente de pago/garantía'&&<p>Antes de pagar, el oferente debe aceptar la solicitud y ambos deben acordar el encuentro.</p>}
     </>}
    </>}
    {isPaid(payment)&&<button disabled={busy} onClick={document}>{owner?'Descargar liquidación':'Descargar constancia'}</button>}
    {data.documents?.length>0&&<section aria-label="Documentos de mi operación">
     <h4>Documentos de mi operación</h4>
     <ul>{data.documents.map(doc=><li key={doc.kind}>{doc.title} · S/ {doc.amount}
      <button disabled={busy} onClick={()=>previewDocument(doc.kind)}>Abrir documento</button></li>)}</ul>
     {preview&&<FinanceDocumentPreview document={preview} busy={busy} onClose={()=>setPreview(null)} onDownload={()=>downloadFinanceDocument(preview)}/>}
     <p>El envío por correo requiere un canal habilitado.</p>
    </section>}
    <button disabled={busy} onClick={()=>{setError('');setRevision(value=>value+1);}}>Actualizar estado económico</button>
   </>}
  </>}
 </section>;
}
