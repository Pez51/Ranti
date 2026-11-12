import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { IncidenceCase } from '../operations/IncidencePanel';
import { incidenceReasonLabels } from '../../lib/incidence-labels';
export default function AdminIncidences({token}){
 const [data,setData]=useState(null),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0),[selected,setSelected]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let current=true;apiRequest(`/admin/incidences?offset=${offset}`,{token}).then(result=>{if(current)setData(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[token,offset,revision]);
 function refresh(){setError('');setRevision(v=>v+1);}
 return <section aria-label="Gestión administrativa de incidencias"><h2>Incidencias de operaciones</h2><button onClick={refresh}>Actualizar casos</button>
  {error&&<p role="alert">{error}</p>}{!data?<p>Cargando casos…</p>:<>
   {!data.items.length&&<p>No hay casos en esta página.</p>}
   <div className="admin-incidence-list">{data.items.map(item=><button key={item.id} onClick={()=>setSelected(item.id)}><strong>{item.title}</strong><span>{item.modality} · {item.status}</span><span>{incidenceReasonLabels[item.type]||item.type} · {item.reporter_name||'Participante'}</span></button>)}</div>
   <button disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-20))}>Casos anteriores</button><button disabled={data.items.length<20||offset>=10000} onClick={()=>setOffset(v=>v+20)}>Más casos</button>
  </>}
  {selected&&<IncidenceCase key={`${selected}-${token}`} id={selected} token={token} admin onChanged={refresh}/>}
 </section>;
}
