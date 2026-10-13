import { useEffect,useState } from 'react';
import { chatRequest } from '../../lib/chat-request';

export default function AdminChats({token}){
  const [list,setList]=useState(null),[history,setHistory]=useState(null),[selected,setSelected]=useState(null);
  const [offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[historyRevision,setHistoryRevision]=useState(0);
  const [error,setError]=useState(''),[historyError,setHistoryError]=useState(''),[olderBusy,setOlderBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();let active=true;
    chatRequest(`/admin/conversations?offset=${offset}`,{token,signal:controller.signal}).then(result=>{if(active)setList(result);}).catch(e=>{if(active&&e.name!=='AbortError'){setError(e.message);setList(null);setSelected(null);setHistory(null);}});
    return()=>{active=false;controller.abort();};
  },[token,offset,revision]);
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();let active=true;
    chatRequest(`/admin/conversations/${selected}/messages`,{token,signal:controller.signal}).then(result=>{if(active)setHistory(result);}).catch(e=>{if(active&&e.name!=='AbortError'){setHistoryError(e.message);setHistory(null);}});
    return()=>{active=false;controller.abort();};
  },[token,selected,historyRevision]);
  function select(id){setSelected(id);setHistory(null);setHistoryError('');setHistoryRevision(value=>value+1);}
  async function older(){
    if(olderBusy||!history?.before)return;setOlderBusy(true);setHistoryError('');
    try{const result=await chatRequest(`/admin/conversations/${selected}/messages?before=${history.before}`,{token});setHistory(previous=>previous?.conversation.id===result.conversation.id?{...result,items:[...result.items,...previous.items.filter(message=>!result.items.some(old=>old.id===message.id))]}:previous);}
    catch(e){setHistoryError(e.message);setHistory(null);}finally{setOlderBusy(false);}
  }
  function page(value){setOffset(value);setList(null);setSelected(null);setHistory(null);setError('');}
  return <section className="admin-chats" aria-label="Revisión administrativa de chats">
    <header><div><h2>Todos los chats</h2><p>Solo lectura · Cada consulta se registra en auditoría.</p></div><button onClick={()=>{setList(null);setError('');setRevision(value=>value+1);}}>Actualizar lista de chats</button></header>
    {error&&<p role="alert">{error}</p>}
    <div className="admin-chat-layout"><aside aria-label="Conversaciones de usuarios">
      {!list&&!error&&<p>Cargando chats…</p>}
      {list?.items.length===0&&<p>No hay conversaciones.</p>}
      {list?.items.map(item=><button className="admin-chat-select" key={item.id} aria-pressed={selected===item.id} onClick={()=>select(item.id)}><strong>{item.title}</strong><span>Oferente: {item.owner_name||'Usuario UCSM'}</span><span>Interesado: {item.requester_name||'Usuario UCSM'}</span></button>)}
      {list&&<div className="admin-chat-pages"><button disabled={offset===0} onClick={()=>page(offset-20)}>Chats anteriores</button><button disabled={!list.has_more||offset>=10000} onClick={()=>page(offset+20)}>Más chats</button></div>}
    </aside><div className="admin-chat-history" aria-label="Historial administrativo">
      {!selected?<p>Selecciona una conversación para revisar su historial.</p>:<>
        <button disabled={olderBusy} onClick={()=>select(selected)}>Actualizar historial</button>
        {historyError&&<p role="alert">{historyError}</p>}
        {!history&&!historyError&&<p>Cargando historial…</p>}
        {history&&<><h3>{history.conversation.title}</h3><p>Oferente: {history.conversation.owner_name||'Usuario UCSM'} · Interesado: {history.conversation.requester_name||'Usuario UCSM'}</p>
          {history.before&&<button disabled={olderBusy} onClick={older}>Cargar mensajes anteriores</button>}
          {!history.items.length&&<p>Esta conversación aún no tiene mensajes.</p>}
          <ol aria-label="Mensajes revisados">{history.items.map(message=><li key={message.id} className={message.kind==='workflow_event'?'admin-chat-event':''}>
            <strong>{message.kind==='workflow_event'?'Aviso de Ranti · ':''}{message.sender_name||'Usuario UCSM'} · {message.sender_is_owner?'Oferente':'Interesado'}</strong>
            <p>{message.body}</p><time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú)</time>
          </li>)}</ol>
        </>}
      </>}
    </div></div>
  </section>;
}
