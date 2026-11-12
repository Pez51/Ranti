import { useState } from 'react';
import { apiRequest } from '../../lib/api';
export default function ReputationSummary({profile,token}){
 const [extra,setExtra]=useState([]),[more,setMore]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const self=profile.is_self===true,comments=[...(profile.received_comments||[]),...extra];
 async function loadMore(){if(busy)return;setBusy(true);setError('');try{
  const result=await apiRequest(`/users/${profile.id}/reviews?offset=${(profile.comments_offset||0)+50+extra.length}`,{token});setExtra(v=>[...v,...result.received_comments]);setMore(result.comments_has_more);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="reputation-summary" aria-label={self?'Comentarios recibidos':'Reputación por rol'}>
  <h3>{self?'Comentarios recibidos':'Reputación por rol'}</h3>
  {self?<p>Tu puntuación no se muestra. Aquí puedes leer tus comentarios recibidos una vez publicados.</p>:<div className="role-reputations">{[['as_owner','Como oferente'],['as_requester','Como comprador/arrendatario']].map(([key,label])=>{
   const r=profile.reputation?.[key];return <div key={key}><strong>{label}</strong><p>{r?.count>0&&r.score!=null?`★ ${Number(r.score).toFixed(2)} / 5`:'Sin evaluaciones todavía'} · {r?.count||0} evaluaciones</p></div>;
  })}</div>}
  {self&&<p>{(profile.reputation?.as_owner?.count||0)+(profile.reputation?.as_requester?.count||0)} evaluaciones publicadas recibidas</p>}
  {!comments.length&&<p>{self?'Aún no hay comentarios publicados.':'Las puntuaciones se calculan únicamente con evaluaciones publicadas.'}</p>}
  <ul>{comments.map(item=><li key={item.id}><strong>{item.author_name||'Participante'}</strong> · {item.subject_role==='owner'?'Como oferente':'Como comprador/arrendatario'} · {item.modality}<p>{item.comment}</p></li>)}</ul>
  {(more??profile.comments_has_more)&&<button type="button" disabled={busy} onClick={loadMore}>Ver más comentarios</button>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
