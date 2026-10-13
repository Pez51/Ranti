import { useCallback,useEffect,useMemo,useState } from 'react';
import { MessageCircle,X,RefreshCw } from 'lucide-react';
import { apiRequest,publicationImageUrl } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { ChatWorkspaceContext } from '../../lib/chat-workspace-context';
import { ConversationWindow } from './Conversations';
import UserAvatar from '../../components/layout/UserAvatar';
import MemberProfileDialog from '../../components/layout/MemberProfileDialog';
import './chat-workspace.css';

function DockInbox({token,onOpen,onProfile,onClose}){
  const [items,setItems]=useState(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const load=()=>{if(document.hidden)return;apiRequest(`/conversations?offset=${offset}`,{token,signal:controller.signal}).then(data=>setItems(data.items||[])).catch(e=>{if(e.name!=='AbortError')setError(e.message);});};
    load();const timer=setInterval(load,30000);document.addEventListener('visibilitychange',load);
    return()=>{controller.abort();clearInterval(timer);document.removeEventListener('visibilitychange',load);};
  },[token,offset,revision]);
  return <aside className="chat-tray" aria-label="Bandeja de conversaciones">
    <header><h2>Conversaciones</h2><button aria-label="Actualizar chats" onClick={()=>{setError('');setRevision(v=>v+1);}}><RefreshCw size={17}/></button><button aria-label="Cerrar bandeja" onClick={onClose}><X size={18}/></button></header>
    {error&&<p role="alert">{error}</p>}
    <div className="chat-tray-list">{items===null?<p>Cargando…</p>:!items.length?<p>Aún no hay consultas.</p>:items.map(item=><article key={item.id} className={item.is_my_product?'chat-owned':'chat-wanted'}>
      <button className="chat-tray-person" onClick={()=>onProfile(item.counterpart_id)} disabled={!item.counterpart_id}><span className="chat-avatar"><UserAvatar user={{avatar_url:item.counterpart_photo}}/></span><strong>{item.counterpart_name||'Usuario UCSM'}</strong></button>
      <button className="chat-tray-conversation" onClick={()=>onOpen(item.id)}>
        {publicationImageUrl(item.product_image)&&<img src={publicationImageUrl(item.product_image)} alt=""/>}
        <span><span className={`chat-product-tag ${item.is_my_product?'owned':'wanted'}`}>{item.is_my_product?'Mi producto':'Me interesa'}</span><strong>{item.title}</strong><span className="chat-preview">{item.last_message||'Iniciar conversación'}</span></span>
      </button>
    </article>)}</div>
    <footer><button disabled={offset===0} onClick={()=>{setItems(null);setOffset(v=>v-20);}}>Anterior</button><button disabled={items?.length!==20||offset>=10000} onClick={()=>{setItems(null);setOffset(v=>v+20);}}>Siguiente</button></footer>
  </aside>;
}

export default function ChatWorkspace({children}){
  const [session,setSession]=useState(getSession),[state,setState]=useState({token:null,windows:[],tray:false,profile:null});
  const token=session?.token;
  useEffect(()=>{const sync=()=>setSession(getSession());window.addEventListener('ranti-auth-changed',sync);window.addEventListener('storage',sync);return()=>{window.removeEventListener('ranti-auth-changed',sync);window.removeEventListener('storage',sync);};},[]);
  const openConversation=useCallback(id=>{if(!token)return;setState(previous=>{
    const current=previous.token===token?previous:{token,windows:[],tray:false,profile:null};
    const exists=current.windows.some(window=>window.id===id);
    const windows=exists?current.windows.map(window=>window.id===id?{...window,minimized:false}:window):[...current.windows,{id,minimized:false}];
    let excess=windows.filter(window=>!window.minimized).length-3;
    return {...current,tray:window.innerWidth<700?false:current.tray,windows:windows.map(window=>{
      if(excess>0&&window.id!==id&&!window.minimized){excess--;return {...window,minimized:true};}return window;
    })};
  });},[token]);
  const openInbox=useCallback(()=>{if(token)setState(previous=>({...previous,token,windows:previous.token===token?previous.windows:[],profile:null,tray:true}));},[token]);
  const showProfile=useCallback(id=>{if(token&&id)setState(previous=>({...previous,token,windows:previous.token===token?previous.windows:[],profile:id}));},[token]);
  const workspace=useMemo(()=>({openConversation,openInbox,showProfile}),[openConversation,openInbox,showProfile]);
  const current=state.token===token?state:{windows:[],tray:false,profile:null};
  return <ChatWorkspaceContext.Provider value={workspace}>
    {children}
    {token&&<div key={token} className="chat-workspace">
      {!current.tray&&<button type="button" className="chat-launcher" onClick={openInbox}><MessageCircle size={20}/>Chats</button>}
      {current.tray&&<DockInbox token={token} onOpen={openConversation} onProfile={showProfile} onClose={()=>setState(previous=>({...previous,tray:false}))}/>}
      <div className={`chat-windows ${current.tray?'with-tray':''}`}>
        {current.windows.map(window=><ConversationWindow key={window.id} id={window.id} token={token} compact minimized={window.minimized} onProfile={showProfile}
          onClose={()=>setState(previous=>({...previous,windows:previous.windows.filter(item=>item.id!==window.id)}))}
          onMinimize={()=>window.minimized?openConversation(window.id):setState(previous=>({...previous,windows:previous.windows.map(item=>item.id===window.id?{...item,minimized:true}:item)}))}/>)}
      </div>
      {current.profile&&<MemberProfileDialog key={current.profile} id={current.profile} token={token} onClose={()=>setState(previous=>({...previous,profile:null}))}/>}
    </div>}
  </ChatWorkspaceContext.Provider>;
}
