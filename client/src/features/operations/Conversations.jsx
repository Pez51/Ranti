import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import CalendarDialog from './CalendarDialog';
import ChatPaymentDialog from './ChatPaymentDialog';
import { useChatWorkspace } from '../../lib/chat-workspace-context';
import UserAvatar from '../../components/layout/UserAvatar';
import { Minus,X } from 'lucide-react';
import { CalendarDays } from 'lucide-react';
import { chatRequest } from '../../lib/chat-request';

function Inbox({token}) {
  const [items,setItems]=useState(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    apiRequest(`/conversations?offset=${offset}`,{token,signal:controller.signal}).then(data=>setItems(data.items)).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>controller.abort();
  },[token,offset,revision]);
  return <main className="workflow max-w-4xl mx-auto"><h1>Mis conversaciones</h1><p>Chats entre participantes de cada publicación. Administración puede revisarlos; sus accesos quedan registrados.</p>
    <button onClick={()=>{setError('');setRevision(v=>v+1);}}>Actualizar conversaciones</button>
    {error&&<p role="alert">{error}</p>}{items===null&&<p>Cargando conversaciones…</p>}
    {items?.length===0&&<p>Aún no tienes conversaciones. Abre una publicación y pulsa «Consultar al oferente».</p>}
    {items?.map(item=><article key={item.id}><Link to={`/mensajes/${item.id}`}><strong>{item.title}</strong> · {item.counterpart_name||'Participante'}</Link><p>Última actividad: {new Date(item.updated_at).toLocaleString('es-PE')}</p></article>)}
    <button disabled={offset===0} onClick={()=>{setItems(null);setOffset(v=>v-20);}}>Anteriores</button><button disabled={items?.length!==20} onClick={()=>{setItems(null);setOffset(v=>v+20);}}>Siguientes</button>
  </main>;
}
export function ConversationWindow({id,token,compact=false,onProfile,onClose,onMinimize,minimized=false}){
  const [data,setData]=useState(null),[messages,setMessages]=useState([]),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[olderBusy,setOlderBusy]=useState(false);
  const draft=useRef(new Map()),alive=useRef(true);
  const [retry,setRetry]=useState(0),[calendarOpen,setCalendarOpen]=useState(null);
  const [quickTextSent,setQuickTextSent]=useState(false);
  const [paymentOpen,setPaymentOpen]=useState(null);
  const [sentCalendar,setSentCalendar]=useState(()=>new Set());
  const lastSeen=useRef(null),messageList=useRef(null),follow=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[id,token]);
  useEffect(()=>{if(!minimized&&follow.current&&messageList.current)messageList.current.scrollTop=messageList.current.scrollHeight;},[messages,minimized]);
  useEffect(()=>{
    if(minimized)return;
    let cancelled=false,inFlight=false;const controller=new AbortController();
    async function load(){
      if(document.hidden||inFlight)return;inFlight=true;
      try{const result=await chatRequest(`/conversations/${id}/messages`,{token,signal:controller.signal});
        if(!cancelled){
          setError('');
          const gap=lastSeen.current&&result.items.length===50&&BigInt(result.items[0].id)>BigInt(lastSeen.current);
          setData(previous=>previous&&!gap?{...result,before:previous.before}:result);
          setMessages(previous=>{const merged=new Map((gap?[]:previous).map(m=>[m.id,m]));result.items.forEach(m=>merged.set(m.id,m));return [...merged.values()].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);});
          lastSeen.current=result.items.at(-1)?.id??lastSeen.current;
        }}
      catch(e){if(!cancelled&&e.name!=='AbortError')setError(e.message);}finally{inFlight=false;}
    }
    load();const timer=setInterval(load,15000);document.addEventListener('visibilitychange',load);
    return()=>{cancelled=true;controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);};
  },[id,token,minimized,retry]);
  async function send(event){
    event.preventDefault();if(text.trim())await transmit(text.trim(),null,true);
  }
  async function transmit(body,operationId=null,clearComposer=false){
    if(busy||!data)return;setBusy(true);setError('');
    const key=JSON.stringify([body,operationId]);
    if(!draft.current.has(key))draft.current.set(key,operationId?{kind:'calendar_invitation',operation_id:operationId,client_id:crypto.randomUUID()}:{body,client_id:crypto.randomUUID()});
    try{const result=await chatRequest(`/conversations/${id}/messages`,{token,method:'POST',body:JSON.stringify(draft.current.get(key))});
      if(alive.current){follow.current=true;setMessages(previous=>previous.some(m=>m.id===result.message.id)?previous:[...previous,result.message]);if(clearComposer)setText('');draft.current.delete(key);if(operationId)setSentCalendar(previous=>new Set([...previous,operationId]));return true;}}
    catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setBusy(false);}
  }
  async function older(){
    if(olderBusy||!data?.before)return;setOlderBusy(true);
    try{const result=await chatRequest(`/conversations/${id}/messages?before=${data.before}`,{token});if(alive.current){setMessages(previous=>[...result.items.filter(m=>!previous.some(p=>p.id===m.id)),...previous]);setData(previous=>({...previous,before:result.before}));}}
    catch(e){if(alive.current)setError(e.message);}finally{if(alive.current)setOlderBusy(false);}
  }
  const activeDeal=data?.deals?.find(deal=>['Aceptada','Pendiente de pago/garantía','Lista para entrega'].includes(deal.status));
  const paymentDeals=data?.is_my_product?[]:(data?.deals||[]).filter(deal=>deal.payment_available);
  const calendarSent=activeDeal&&(sentCalendar.has(activeDeal.id)||messages.some(message=>message.mine&&message.kind==='calendar_invitation'&&message.operation_id===activeDeal.id));
  const suggestions=activeDeal?(data?.is_my_product?['Hola, coordinemos nuestro encuentro.','¿Te parece vernos dentro de la UCSM?','Marcaré mis horarios disponibles.']:['Gracias, coordinemos el encuentro.','¿Podemos vernos dentro de la UCSM?','Marcaré mis horarios disponibles.']):(data?.is_my_product?['Hola, ¿en qué puedo ayudarte?','Te confirmo la disponibilidad enseguida.','¿Qué te gustaría saber del artículo?']:['Hola, ¿sigue disponible?','¿Me cuentas más sobre el artículo?','¿Podemos encontrarnos dentro de la UCSM?']);
  return <section className={compact?`chat-window ${data?.is_my_product?'chat-owned':'chat-wanted'} ${minimized?'chat-minimized':''}`:'workflow chat-page max-w-4xl mx-auto'} aria-label={`Chat: ${data?.counterpart_name||'Conversación'}`}>
    {compact?<header className="chat-window-header">
      <button type="button" className="chat-person" disabled={!data?.counterpart?.id} onClick={()=>onProfile?.(data.counterpart.id)}><span className="chat-avatar"><UserAvatar user={data?.counterpart}/></span><span>{data?.counterpart_name||(error?'Chat sin conexión':'Cargando…')}</span></button>
      <button type="button" aria-label={minimized?'Restaurar chat':'Minimizar chat'} onClick={onMinimize}><Minus size={16}/></button><button type="button" aria-label="Cerrar chat" onClick={onClose}><X size={16}/></button>
    </header>:<><Link to="/mensajes">← Mis conversaciones</Link><h1>{data?.publication.title||'Conversación'}</h1></>}
    <div className="chat-window-body" hidden={minimized}>
    <p className="chat-admin-disclosure">Administración puede revisar este chat. Accesos registrados.</p>
    {data&&<div className="chat-product-context"><span className={`chat-product-tag ${data.is_my_product?'owned':'wanted'}`}>{data.is_my_product?'Mi producto':'Me interesa'}</span><Link to={`/producto/${data.publication.id}`}>{data.publication.title}</Link></div>}
    {data?.deals?.length>0&&<button type="button" className="chat-calendar-quick" onClick={()=>setCalendarOpen('all')}><CalendarDays size={17}/>Abrir calendario y entrega</button>}
    {error&&<div role="alert">{error}<button type="button" onClick={()=>{setError('');setRetry(v=>v+1);}}>Reintentar carga del chat</button></div>}
    {data?.before&&<button disabled={olderBusy} onClick={older}>Cargar mensajes anteriores</button>}
    {!data&&!error&&<p>Cargando chat…</p>}{data&&messages.length===0&&<p>Envía tu primera consulta sobre el artículo.</p>}
    <ol ref={messageList} onScroll={()=>{const list=messageList.current;follow.current=list.scrollHeight-list.scrollTop-list.clientHeight<60;}} className="chat-messages" aria-label="Mensajes">{messages.map(message=><li key={message.id} className={`${message.mine?'chat-message mine':'chat-message'} ${message.kind==='calendar_invitation'?'chat-calendar-invitation':''} ${message.kind==='workflow_event'?'chat-workflow-event':''}`}>{message.kind==='workflow_event'?<><strong>Ranti · Actualización del trato</strong><span className="chat-event-actor">{message.mine?'Tú':data?.counterpart_name||'La otra persona'}</span></>:<button type="button" className="chat-sender" onClick={()=>onProfile?.(message.mine?getSession()?.user.id:data?.counterpart?.id)}>{message.mine?'Tú':data?.counterpart_name||'Participante'}</button>}
      {message.kind==='calendar_invitation'?<><strong><CalendarDays size={18}/>Calendario para acordar el encuentro</strong><p>Marquen sus horarios y confirmen juntos cuándo entregar el artículo.</p>
        {data?.deals?.some(deal=>deal.id===message.operation_id)?<button type="button" className="chat-open-calendar" onClick={()=>setCalendarOpen(message.operation_id)}>Elegir horarios y confirmar encuentro</button>:<Link to="/operaciones">Ver coordinación en mis operaciones</Link>}</>:<p>{message.body}</p>}
      {message.kind==='workflow_event'&&['calendar.saved','calendar.skipped','handoff.propose','handoff.agree','handoff.request-change'].includes(message.event_type)&&data?.deals?.some(deal=>deal.id===message.operation_id)&&<button type="button" className="chat-open-calendar" onClick={()=>setCalendarOpen(message.operation_id)}>Ver coordinación</button>}
      <time dateTime={message.created_at}>{compact?new Date(message.created_at).toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'}):new Date(message.created_at).toLocaleString('es-PE')}</time></li>)}</ol>
    {paymentDeals.map(deal=><div className="chat-payment-bubble" key={deal.id}><strong>Encuentro acordado</strong><span>El siguiente paso es el pago simulado. Sin cobro real.</span><button type="button" onClick={()=>setPaymentOpen(deal.id)}>Continuar al pago simulado{paymentDeals.length>1?` · ${deal.id.slice(0,8)}`:''}</button></div>)}
    {data&&(!quickTextSent||!calendarSent)&&<div className="chat-quick-actions" aria-label="Mensajes rápidos">
      {!quickTextSent&&<><span>Enviar con un toque</span><div>{suggestions.map(body=><button type="button" key={body} disabled={busy} onClick={async()=>{if(await transmit(body))setQuickTextSent(true);}}>{body}</button>)}</div></>}
      {!calendarSent&&<button type="button" className="chat-calendar-quick" disabled={busy||!activeDeal} onClick={()=>transmit('',activeDeal.id)}><CalendarDays size={17}/><span>{activeDeal?'Invitar al calendario del encuentro':'Calendario disponible al aceptar el trato'}</span></button>}
    </div>}
    <form className="chat-compose" onSubmit={send}><label htmlFor={`chat-message-${id}`} className={compact?'chat-sr-only':''}>Mensaje</label><textarea id={`chat-message-${id}`} placeholder="Escribe un mensaje…" rows={2} maxLength={1000} disabled={busy||!data} value={text} onChange={event=>setText(event.target.value)}/><span className="chat-character-count">{text.length}/1000</span><button disabled={busy||!data||!text.trim()}>{busy?'Enviando…':'Enviar mensaje'}</button></form>
    </div>
    {calendarOpen&&data&&<CalendarDialog deals={calendarOpen==='all'?data.deals:data.deals.filter(deal=>deal.id===calendarOpen)} token={token} title={data.publication.title} onClose={()=>{setCalendarOpen(null);setRetry(value=>value+1);}}/>}
    {paymentOpen&&<ChatPaymentDialog operationId={paymentOpen} token={token} onClose={()=>{setPaymentOpen(null);setRetry(value=>value+1);}} onCompleted={()=>{setPaymentOpen(null);setRetry(value=>value+1);}}/>}
  </section>;
}
export default function Conversations(){
  const {id}=useParams(),token=getSession()?.token,workspace=useChatWorkspace();
  const openConversation=workspace?.openConversation,openInbox=workspace?.openInbox;
  useEffect(()=>{if(openConversation){if(id)openConversation(id);else openInbox();}},[id,openConversation,openInbox]);
  if(workspace)return <div className="workflow"><h1>Mis conversaciones</h1><p>Abre tus chats desde la bandeja derecha. Puedes mantener varias conversaciones abiertas.</p></div>;
  return id?<ConversationWindow key={id} id={id} token={token}/>:<Inbox token={token}/>;
}
