import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
export default function ProductReviews({publicationId}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!open)return;let current=true;apiRequest(`/publications/${publicationId}/reviews?offset=${offset}`).then(result=>{if(current)setData(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[publicationId,open,offset,revision]);
 return <section className="product-reviews"><button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Reseñas del producto</button>
  {open&&<><h3>Experiencias con este artículo</h3>{error&&<p role="alert">{error}<button onClick={()=>{setError('');setRevision(v=>v+1);}}>Reintentar reseñas</button></p>}{data?<>
   <p>{data.count>0&&data.score!=null?`★ ${Number(data.score).toFixed(2)} / 5`:'Sin reseñas todavía'} · {data.count} reseñas</p><small>Estas reseñas evalúan el artículo, no la reputación de su oferente.</small>
   <ul>{data.items.map(item=><li key={item.id}><strong>★ {item.rating} / 5 · {item.author_name||'Participante'}</strong> · {item.modality}{item.comment&&<p>{item.comment}</p>}</li>)}</ul>
   <button disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-20))}>Reseñas anteriores</button><button disabled={!data.has_more||offset>=10000} onClick={()=>setOffset(v=>v+20)}>Más reseñas</button>
  </>:!error&&<p>Cargando reseñas…</p>}</>}
 </section>;
}
