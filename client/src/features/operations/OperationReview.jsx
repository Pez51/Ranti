import { useEffect,useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Star } from 'lucide-react';
function Stars({label,value,onChange,disabled}){
 return <fieldset className="review-stars" disabled={disabled}><legend>{label}</legend><div role="radiogroup" aria-label={label}>{[1,2,3,4,5].map(n=><button type="button" role="radio" aria-checked={value===n} aria-label={`${n} ${n===1?'estrella':'estrellas'}`} key={n} onClick={()=>onChange(n)}><Star aria-hidden="true" size={27} fill={n<=value?'currentColor':'none'}/></button>)}</div></fieldset>;
}
export default function OperationReview({operationId,token}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const [person,setPerson]=useState(0),[product,setProduct]=useState(0),[personComment,setPersonComment]=useState(''),[productComment,setProductComment]=useState('');
 useEffect(()=>{if(!open)return;let current=true;apiRequest(`/operations/${operationId}/review`,{token}).then(result=>{if(current)setData(result);}).catch(e=>{if(current)setError(e.message);});return()=>{current=false;};},[operationId,token,open,revision]);
 async function submit(event){event.preventDefault();if(busy||!person)return;setBusy(true);setError('');try{
  const body={person_rating:person,person_comment:personComment,...(!data.is_owner&&product?{product_rating:product,product_comment:productComment}:{})};
  const result=await apiRequest(`/operations/${operationId}/review`,{token,method:'POST',body:JSON.stringify(body)});
  setData(result);setPerson(0);setProduct(0);setPersonComment('');setProductComment('');
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 const who=data?.is_owner?(data.modality==='Venta'?'comprador':data.modality==='Alquiler'?'arrendatario':'solicitante'):'oferente';
 return <section className="operation-review" aria-label="Evaluación del trato cerrado"><h3>Trato finalizado: comparte tu experiencia</h3>
  <button type="button" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?'Ocultar evaluación':'Evaluar esta operación'}</button>
  {open&&<>{error&&<p role="alert">{error}<button type="button" onClick={()=>{setError('');setRevision(v=>v+1);}}>Actualizar evaluación</button></p>}
   {!data?!error&&<p>Cargando evaluación…</p>:<>
    <p>Las evaluaciones se publican cuando ambos participan o al cumplirse {data.publication_days} días desde el cierre.{data.publish_after?` Fecha prevista: ${new Date(data.publish_after).toLocaleString('es-PE',{timeZone:'America/Lima'})} (Perú).`:''}</p>
    {data.submitted?<p role="status">{data.published?'Tu evaluación ya está publicada.':'Evaluación enviada y oculta. No se muestra su contenido hasta que ambos evalúen o venza el plazo.'}</p>:!data.eligible?<p>{data.reason}</p>:<form onSubmit={submit}><fieldset disabled={busy}>
     <Stars label={`¿Cómo fue tu experiencia con el ${who}?`} value={person} onChange={setPerson} disabled={busy}/>
     <label>Comentario sobre la persona (opcional)<textarea maxLength={1000} value={personComment} onChange={e=>setPersonComment(e.target.value)}/></label>
     <small>Evalúa comunicación, puntualidad y cumplimiento de lo acordado{data.is_owner&&data.modality!=='Venta'?', incluido el cuidado y devolución del artículo':''}. Este comentario se mostrará al destinatario al publicarse.</small>
     {!data.is_owner&&<>
      <Stars label={`¿Cómo estuvo el artículo que ${data.modality==='Venta'?'compraste':data.modality==='Alquiler'?'alquilaste':'recibiste prestado'}? (opcional)`} value={product} onChange={setProduct} disabled={busy}/>
      {product>0&&<><label>Reseña del producto (opcional)<textarea maxLength={1000} value={productComment} onChange={e=>setProductComment(e.target.value)}/></label><button type="button" onClick={()=>{setProduct(0);setProductComment('');}}>Omitir reseña del producto</button></>}
      <small>La reseña del producto se publicará en el artículo y se calcula por separado de la reputación de la persona.</small>
     </>}
     <p>Solo una evaluación por participante y operación. No podrás editarla ni repetirla. No incluyas datos personales.</p>
     <button disabled={!person}>{busy?'Enviando…':'Enviar evaluación'}</button>
    </fieldset></form>}
   </>}
  </>}
 </section>;
}
