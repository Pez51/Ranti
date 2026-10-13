import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { useChatWorkspace } from '../../lib/chat-workspace-context';
export default function OpenChat({ publicationId, operationId, ownerId }) {
  const session=getSession(),navigate=useNavigate();
  const workspace=useChatWorkspace();
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function open(){
    if(busy)return;setBusy(true);setError('');
    try{const result=await apiRequest(`/conversations/${operationId?'operation':'publication'}/${operationId||publicationId}`,{token:session.token,method:'POST',body:'{}'});if(workspace)workspace.openConversation(result.id);else navigate(`/mensajes/${result.id}`);}
    catch(failure){setError(failure.message);}finally{setBusy(false);}
  }
  if(!session)return <Link to="/login">Inicia sesión para consultar al oferente</Link>;
  if(!operationId&&session.user.id===ownerId)return workspace?<button type="button" onClick={workspace.openInbox}>Ver consultas de mis publicaciones</button>:<Link to="/mensajes">Ver consultas de mis publicaciones</Link>;
  return <div className="open-chat"><button type="button" disabled={busy} onClick={open}>{busy?'Abriendo chat…':operationId?'Abrir chat de esta operación':'Consultar al oferente'}</button>{error&&<p role="alert">{error}</p>}</div>;
}
