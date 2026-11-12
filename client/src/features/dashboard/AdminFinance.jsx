import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { downloadFinanceDocument } from '../../lib/finance-documents';
import FinanceDocumentPreview from '../operations/FinanceDocumentPreview';
import AdminFinanceMovements from './AdminFinanceMovements';
import AdminFinanceChargeback from './AdminFinanceChargeback';
const amount=value=>{const n=BigInt(value||0),a=n<0n?-n:n;return `${n<0n?'-':''}${a/100n}.${String(a%100n).padStart(2,'0')}`;};
const confirmed=row=>['simulated_succeeded','sandbox_succeeded'].includes(row.payment_status);
function availableDocuments(row){
 const kinds=[
  row.public_snapshot.modality==='Venta'?['sale','Boleta de venta — muestra']:['rental','Boleta de alquiler — muestra'],
  ['commission','Comprobante de comisión — muestra'],['payment','Constancia de pago de prueba'],
 ];
 if(BigInt(row.economics.guarantee_charged_cents)>0n)kinds.push(['guarantee','Constancia de garantía']);
 if(row.payout_reference)kinds.push(['payout','Constancia de abono al oferente']);
 if(row.refund_reference)kinds.push(['refund','Constancia de reembolso'],['refund_adjustment','Ajuste por reembolso']);
 if(row.guarantee_decided_at){
  if(BigInt(row.guarantee_cents)>BigInt(row.decided_cents))kinds.push(['guarantee_refund','Devolución de la garantía']);
  if(BigInt(row.decided_cents)>0n)kinds.push(['guarantee_retention','Importe asignado de la garantía']);
 }
 return kinds;
}
function Row({row,token,onChange}){
 const [cost,setCost]=useState(''),[reference,setReference]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [reason,setReason]=useState(''),[lossKind,setLossKind]=useState(''),[lossAmount,setLossAmount]=useState(''),[lossReference,setLossReference]=useState('');
 const [preview,setPreview]=useState(null),[kind,setKind]=useState('payment');
 const [attemptEvidence,setAttemptEvidence]=useState(''),[attemptOutcome,setAttemptOutcome]=useState('unknown');
 const path=`/admin/finance/${row.operation_id}`;
 async function reconcile(){
  setBusy(true);setError('');
  try{
   const loss=lossKind?{kind:lossKind,amount_cents:lossAmount,reference:lossReference}:null;
   await apiRequest(`/admin/finance/${row.operation_id}/reconciliation`,{token,method:'POST',
    body:JSON.stringify({reference,...(row.mode==='simulated'?{actual_cost_cents:cost}:{}),...(loss?{loss}:{})})});
   onChange();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function accessDocument(kind,action){
  setBusy(true);setError('');
  try{
   const doc=await apiRequest(`${path}/documents/${kind}`,
    {token,method:'POST',body:JSON.stringify({reason,action})});
   if(action==='preview')setPreview(doc);
   else downloadFinanceDocument(doc);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function consultAttempt(){
  setBusy(true);setError('');
  try{
   await apiRequest(`${path}/payments/${row.payment_id}/consult`,{token,method:'POST',
    body:JSON.stringify({evidence:attemptEvidence,...(row.mode==='simulated'?{outcome:attemptOutcome}:{})})});
   onChange();
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <article><h3>{row.public_snapshot.title||row.operation_id}</h3><p>Operación {row.operation_id} · {row.mode} · Pago: {row.payment_status||'No iniciado'}</p><p>Tarifa: {row.tariff_version}</p>
  <dl>{[['Oferente','owner_cents'],['Ingreso previsto de Ranti (incluye su impuesto)','ranti_expected_cents'],['Ingreso Ranti estimado sin su impuesto','ranti_net_tax_cents'],['Impuesto Ranti incluido, no cargo adicional','ranti_included_tax_cents'],['Costo previsto del procesador','processor_expected_cents'],['Cargo de servicio único','service_cents'],['Garantía cobrada (pasivo reembolsable)','guarantee_charged_cents'],['Total','total_cents']].map(([label,key])=><div key={key}><dt>{label}</dt><dd>S/ {amount(row.economics[key])}</dd></div>)}</dl>
  {row.reconciliation&&<p role="status">Conciliado: costo S/ {amount(row.reconciliation.actual_processor_cents)} · Ingreso Ranti S/ {amount(row.reconciliation.ranti_actual_cents)} · Pérdidas no recuperables S/ {amount(row.reconciliation.nonrecoverable_cents)} · {row.reconciliation.margin_shortfall?'ALERTA: margen inferior al previsto':'Margen previsto preservado'}. Nunca se cobra una diferencia al usuario.</p>}
  {row.payment_id&&<dl>
   <dt>Referencia del pago</dt><dd>{row.provider_reference||'Pendiente'}</dd>
   {row.payout_reference&&<><dt>Abono registrado</dt><dd>{row.payout_reference} · {row.payout_received_at?'Recepción confirmada':'Recepción pendiente'}</dd></>}
   {row.refund_reference&&<><dt>Reembolso de prueba</dt><dd>S/ {amount(row.refund_cents)} · {row.refund_reference} · {row.refund_received_at?'Recepción confirmada':'Recepción pendiente'}</dd></>}
   {row.guarantee_decided_at&&<><dt>Liquidación de la garantía</dt><dd>{row.guarantee_reference}</dd></>}
  </dl>}
  {row.movements?.length>0&&<AdminFinanceMovements path={path} token={token} movements={row.movements}/>}
  {row.payment_status==='pending'&&<fieldset disabled={busy}>
   <legend>Consulta del intento original</legend>
   <p>Intento {row.payment_id} · {row.demo_authorization_required?'Espera la autorización del comprador.':'Consulta el estado del mismo intento.'}</p>
   <label>Evidencia de consulta<textarea value={attemptEvidence} maxLength={500} onChange={event=>setAttemptEvidence(event.target.value)}/></label>
   {row.mode==='simulated'&&
    <label>Resultado verificado de prueba<select value={attemptOutcome} onChange={event=>setAttemptOutcome(event.target.value)}>
     <option value="unknown">Desconocido · mantener en revisión</option>
     {!row.demo_authorization_required&&row.provider_reference&&<option value="confirmed">Confirmado de prueba</option>}
     <option value="not_executed">Sin ejecución de prueba</option>
    </select></label>}
   <button disabled={attemptEvidence.trim().length<5} onClick={consultAttempt}>Conciliar intento original</button>
  </fieldset>}
  {confirmed(row)&&<>
   <label>Referencia de conciliación<input value={reference} maxLength={100} onChange={e=>setReference(e.target.value)}/></label>
   {row.mode==='simulated'&&<label>Costo ficticio del procesador (céntimos)<input inputMode="numeric" value={cost} onChange={e=>setCost(e.target.value)}/></label>}
   <label>Costo no recuperable<select value={lossKind} onChange={event=>setLossKind(event.target.value)}>
    <option value="">Ninguno</option><option value="refund_cost">Costo de reembolso</option><option value="chargeback_cost">Costo de contracargo</option>
   </select></label>
   {lossKind&&<>
    <label>Importe del costo en céntimos<input inputMode="numeric" value={lossAmount} onChange={event=>setLossAmount(event.target.value)}/></label>
    <label>Referencia del costo<input value={lossReference} maxLength={100} onChange={event=>setLossReference(event.target.value)}/></label>
   </>}
   <button disabled={busy||reference.trim().length<3||(lossKind&&(!/^\d{1,10}$/.test(lossAmount)||lossReference.trim().length<3))} onClick={reconcile}>Conciliar registro de prueba</button>
  </>}
  {row.payment_status==='simulated_succeeded'&&row.payout_reference&&
   <AdminFinanceChargeback row={row} token={token} onChange={onChange} formatAmount={amount}/>}
  {confirmed(row)&&<fieldset disabled={busy}>
   <legend>Consulta administrativa de documentos</legend>
   <label>Tipo de documento<select value={kind} onChange={event=>{setKind(event.target.value);setPreview(null);}}>
    {availableDocuments(row).map(([value,label])=><option value={value} key={value}>{label}</option>)}
   </select></label>
   <label>Motivo de consulta<input value={reason} maxLength={300} onChange={event=>setReason(event.target.value)}/></label>
   <button disabled={reason.trim().length<5} onClick={()=>accessDocument(kind,'preview')}>Abrir documento seleccionado</button>
   {preview&&<FinanceDocumentPreview document={preview} busy={busy||reason.trim().length<5}
    onClose={()=>setPreview(null)} onDownload={()=>accessDocument(preview.kind,'download')}/>}
  </fieldset>}
  {error&&<p role="alert">{error}</p>}
 </article>;
}
export default function AdminFinance({token,initialSearch=''}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [query,setQuery]=useState(initialSearch),[search,setSearch]=useState(initialSearch);
 useEffect(()=>{const controller=new AbortController();
  apiRequest(`/admin/finance?${new URLSearchParams({offset:String(offset),search})}`,{token,signal:controller.signal}).then(setData).catch(e=>{
   if(e.name!=='AbortError'){setData(null);setError(e.message);}
  });
  return()=>controller.abort();
 },[offset,token,revision,search]);
 return <section aria-label="Control económico administrativo">
  <h2>Pagos, comisiones y conciliación</h2>
  <p>Registros de prueba de acceso administrativo.</p>
  <form onSubmit={event=>{event.preventDefault();setError('');setSearch(query.trim());setOffset(0);}}>
   <label>Operación, referencia o participante<input value={query} maxLength={120} onChange={event=>setQuery(event.target.value)}/></label>
   <button>Buscar registros</button>
  </form>
  {error&&<p role="alert">{error}</p>}
  {data?.items.map(row=><Row key={row.id} row={row} token={token} onChange={()=>setRevision(value=>value+1)}/>)}
  {data?.items.length===0&&<p>No hay registros para esta búsqueda.</p>}
  <button onClick={()=>{setError('');setRevision(value=>value+1);}}>Actualizar control económico</button>
  <button disabled={offset===0} onClick={()=>setOffset(value=>value-20)}>Economía anterior</button>
  <button disabled={data?.items.length!==20||offset>=10000} onClick={()=>setOffset(value=>value+20)}>Más registros económicos</button>
 </section>;
}
