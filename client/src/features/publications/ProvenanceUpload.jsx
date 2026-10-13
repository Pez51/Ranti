import { useRef,useState } from 'react';
import { Camera,FileCheck,Upload } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { preparePhoto } from '../../lib/prepare-photo';
import { downloadProvenance,isPrivateProvenance } from '../../lib/provenance';
export default function ProvenanceUpload({value,onChange,onProcessing,disabled}){
  const picker=useRef(null),camera=useRef(null),pending=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const locked=disabled||busy;
  async function select(event){
    const file=event.target.files?.[0];event.target.value='';if(!file||pending.current||disabled)return;
    pending.current=true;setBusy(true);setError('');onProcessing(true);
    try{
      const pdf=file.type==='application/pdf'||(!file.type&&/\.pdf$/i.test(file.name));
      if(pdf&&file.size>5*1024*1024)throw new Error('El PDF debe pesar como máximo 5 MB.');
      const blob=pdf?file:await preparePhoto(file);
      const result=await apiRequest('/publications/provenance',{method:'POST',token:getSession()?.token,headers:{'Content-Type':pdf?'application/pdf':blob.type},body:blob});
      onChange(result.ref);
    }catch(failure){setError(`${failure.message} Si ya tenías una boleta, se conserva.`);}
    finally{pending.current=false;setBusy(false);onProcessing(false);}
  }
  async function open(){setError('');try{await downloadProvenance(value,getSession()?.token);}catch(failure){setError(failure.message);}}
  return <section className="provenance-upload" aria-labelledby="provenance-upload-title">
    <h3 id="provenance-upload-title">Boleta o comprobante de procedencia</h3>
    <p>Adjunta una foto legible o un PDF que acredite la compra del artículo. Puedes ocultar datos personales no necesarios, conservando los datos que permitan revisar la compra.</p>
    <input ref={picker} hidden style={{display:'none'}} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-label="Seleccionar boleta o comprobante" disabled={locked} onChange={select}/>
    <input ref={camera} hidden style={{display:'none'}} type="file" accept="image/*" capture="environment" aria-label="Tomar foto de la boleta" disabled={locked} onChange={select}/>
    <div className="provenance-actions"><button type="button" disabled={locked} onClick={()=>picker.current?.click()}><Upload size={18} aria-hidden="true"/>{value?'Reemplazar boleta':'Subir foto o PDF'}</button><button type="button" disabled={locked} onClick={()=>camera.current?.click()}><Camera size={18} aria-hidden="true"/>Fotografiar boleta</button></div>
    {value&&<div className="provenance-attached"><FileCheck size={20} aria-hidden="true"/><span>Comprobante adjunto</span>{isPrivateProvenance(value)?<button type="button" disabled={locked} onClick={open}>Ver boleta</button>:<span>Referencia anterior conservada; puedes reemplazarla por un archivo privado.</span>}<button type="button" disabled={locked} onClick={()=>onChange(null)}>Quitar boleta</button></div>}
    <p className="provenance-help">Foto: se ajusta hasta 2 MB. PDF: hasta 5 MB. El archivo nuevo es privado: solo tú y los administradores autorizados pueden descargarlo. No aparece en el catálogo.</p>
    {busy&&<p role="status">Preparando y subiendo comprobante…</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}
