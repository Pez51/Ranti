import { useContext,useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext } from '../../lib/toast-context';
import { chatRequest } from '../../lib/chat-request';

export default function ChatPaymentDialog({operationId,token,onClose,onCompleted}){
  const dialog=useRef(null),alive=useRef(true);
  const [operation,setOperation]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const toast=useContext(ToastContext);
  useEffect(()=>{
    const element=dialog.current,previous=document.activeElement,controller=new AbortController();alive.current=true;element.showModal();
    chatRequest(`/operations/${operationId}`,{token,signal:controller.signal}).then(result=>{if(alive.current)setOperation(result.operation);}).catch(e=>{if(alive.current&&e.name!=='AbortError')setError(e.message);});
    return()=>{alive.current=false;controller.abort();element.close();previous?.focus();};
  },[operationId,token]);
  const allowed=operation?.status==='Pendiente de pago/garantía'&&operation.handoff?.agreed&&!operation.handoff.change_requested&&!operation.handoff.is_owner&&!operation.payment_simulation?.completed;
  async function pay(){
    if(busy||!allowed)return;setBusy(true);setError('');
    try{await chatRequest(`/operations/${operationId}/payment-simulation`,{token,method:'POST',body:JSON.stringify({confirm_simulation:true})});if(alive.current){toast?.showSuccessToast('Pago simulado registrado. No se cobró dinero.');onCompleted();}}
    catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
  }
  return createPortal(<dialog ref={dialog} className="chat-calendar-dialog workflow" aria-label="Pago simulado del trato" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <h1>Continuar al pago simulado</h1>
    <p>Prueba del piloto académico: no se cobra dinero, no se solicita tarjeta y no se retiene garantía.</p>
    {error&&<p role="alert">{error}</p>}
    {!operation&&!error&&<p>Cargando el importe y el acuerdo…</p>}
    {operation&&<><h2>{operation.publication?.title||'Tu operación'}</h2>
      <p>Encuentro: {operation.handoff?.meeting_at?new Date(operation.handoff.meeting_at).toLocaleString('es-PE',{timeZone:'America/Lima'}):'Sin acordar'} (Perú) · {operation.handoff?.location}</p>
      {operation.payment_quote&&<p><strong>Total de uso simulado: S/ {operation.payment_quote.amount}</strong> · {operation.payment_quote.unit_count} unidad(es). La garantía no se cobra ni se custodia.</p>}
      {!allowed&&<p>El pago ya fue simulado o el acuerdo cambió. Actualiza el chat para consultar el estado.</p>}
    </>}
    <button disabled={busy||!allowed} onClick={pay}>{busy?'Registrando…':'Confirmar simulación sin cobro'}</button>
    <button disabled={busy} onClick={onClose}>Volver al chat</button>
  </dialog>,document.body);
}
