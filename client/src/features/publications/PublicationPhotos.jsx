import { useEffect, useRef, useState } from 'react';
import { Camera, GripHorizontal, ImagePlus, X } from 'lucide-react';
import { apiRequest, publicationImageUrl } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { preparePhoto } from '../../lib/prepare-photo';
import PhotoCropDialog from './PhotoCropDialog';

export default function PublicationPhotos({ images, onChange, disabled, onProcessing }) {
  const gallery = useRef(null); const camera = useRef(null);
  const processing = useRef(false);
  const strip = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const cropResolver = useRef(null);
  const [cropBlob, setCropBlob] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  useEffect(()=>()=>{cropResolver.current?.(null);cropResolver.current=null;},[]);
  const askCrop = blob => new Promise(resolve => { cropResolver.current=resolve; setCropBlob(blob); });
  function finishCrop(blob) { const resolve=cropResolver.current; cropResolver.current=null; setCropBlob(null); resolve?.(blob); }
  async function uploadCropped(file) {
    const prepared=await preparePhoto(file);
    const cropped=await askCrop(prepared);
    if(!cropped) return null;
    const blob=await preparePhoto(cropped);
    return apiRequest('/publications/photos',{method:'POST',token:getSession()?.token,headers:{'Content-Type':blob.type},body:blob});
  }
  async function editPhoto(url) {
    if(processing.current || disabled) return;
    processing.current=true; setUploading(true); onProcessing(true); setError('');
    try {
      const response=await fetch(publicationImageUrl(url));
      if(!response.ok) throw new Error('No se pudo cargar la foto para ajustarla.');
      const result=await uploadCropped(await response.blob());
      if(result) { onChange(images.map(value=>value===url?result.url:value)); setAnnouncement('Encuadre actualizado. Guarda el borrador para conservar el cambio.'); }
    } catch(failure) { setError(failure.message); }
    finally { processing.current=false;setUploading(false);onProcessing(false); }
  }
  async function select(event) {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length || processing.current || disabled) return;
    setError('');
    if (files.length + images.length > 7) { setError('Puedes agregar hasta 7 fotos. Quita alguna o selecciona menos archivos.'); return; }
    processing.current = true; setUploading(true); onProcessing(true);
    const next = [...images];
    try {
      for (const file of files) {
        const result = await uploadCropped(file);
        if(!result) break;
        next.push(result.url); onChange([...next]);
      }
    } catch (failure) { setError(`${failure.message} Las fotos que ya se subieron se conservan; puedes volver a seleccionar las restantes.`); }
    finally { processing.current = false; setUploading(false); onProcessing(false); }
  }
  const locked = disabled || uploading;
  const slots = Math.min(7, Math.max(4, images.length + 1));
  function move(url, target) {
    if (locked) return;
    const from = images.indexOf(url);
    if (from < 0 || target < 0 || target >= images.length || from === target) return;
    const reordered = [...images]; reordered.splice(from, 1); reordered.splice(target, 0, url);
    onChange(reordered); setAnnouncement(`Foto movida a la posición ${target + 1}. La foto 1 es la portada.`);
  }
  function startDrag(event, url, index) {
    if (locked || (event.pointerType === 'mouse' && event.button !== 0)) return;
    drag.current = { url, target: index, startX: event.clientX, moved: false };
    suppressClick.current=false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function updateDrag(event) {
    if (!drag.current || locked) return;
    if (Math.abs(event.clientX - drag.current.startX) < 6 && !drag.current.moved) return;
    drag.current.moved = true;
    const bounds = strip.current.getBoundingClientRect();
    if (event.clientX > bounds.right - 30) strip.current.scrollBy?.({ left: 28 });
    else if (event.clientX < bounds.left + 30) strip.current.scrollBy?.({ left: -28 });
    const tiles = Array.from(strip.current.children).slice(0, images.length);
    let target = 0, distance = Infinity;
    tiles.forEach((tile, index) => {
      const box = tile.getBoundingClientRect();
      const next = Math.abs(event.clientX - (box.left + box.width / 2));
      if (next < distance) { target = index; distance = next; }
    });
    drag.current.target = target; setDropIndex(target);
  }
  function endDrag() {
    const current = drag.current; drag.current = null; setDropIndex(null);
    if (current?.moved) { suppressClick.current=true;move(current.url, current.target); }
  }
  function cancelDrag() { drag.current = null; setDropIndex(null); }
  return <section className="publication-photos" aria-labelledby="publication-photos-title">
    <h3 id="publication-photos-title">Fotos del artículo <span>({images.length}/7)</span></h3>
    <p id="publication-photos-help">Pulsa una foto para ajustar su encuadre; arrástrala hacia los costados para ordenarla. La foto 1 será la portada. Máximo 2 MB por foto.</p>
    <input ref={gallery} hidden style={{ display: 'none' }} className="photo-file-input" type="file" accept="image/*" multiple aria-label="Seleccionar fotos del artículo" aria-describedby="publication-photos-help" disabled={locked} onChange={select} />
    <input ref={camera} hidden style={{ display: 'none' }} className="photo-file-input" type="file" accept="image/*" capture="environment" aria-label="Tomar foto del artículo" disabled={locked} onChange={select} />
    <ol ref={strip} className="publication-photo-grid" aria-label="Orden de las fotos">{images.map((url,index) => <li key={url} className={dropIndex === index ? 'photo-drop-target' : ''}>
      <button className="photo-drag" type="button" aria-label={`Mover foto ${index+1}`} aria-describedby="publication-photos-help" disabled={locked}
        onClick={()=>{if(suppressClick.current) {suppressClick.current=false;return;} editPhoto(url);}}
        onPointerDown={event => startDrag(event,url,index)} onPointerMove={updateDrag} onPointerUp={endDrag} onPointerCancel={cancelDrag}
        onKeyDown={event => {
          if (event.key === 'Escape') cancelDrag();
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(url,index + (event.key === 'ArrowLeft' ? -1 : 1)); }
        }}>
        <img draggable={false} src={publicationImageUrl(url) || undefined} alt={`Foto ${index+1} del artículo`} />
        <span className="photo-cover-label">{index === 0 ? '1 · Portada' : index+1}</span>
        <span className="photo-drag-hint"><GripHorizontal size={18} aria-hidden="true" /></span>
      </button>
      <button className="photo-remove" type="button" aria-label={`Quitar foto ${index+1}`} disabled={locked} onClick={() => { onChange(images.filter((_,i) => i !== index)); setAnnouncement('Foto eliminada. Las posiciones se actualizaron y la foto 1 es la portada.'); }}><X size={16} aria-hidden="true" /></button>
    </li>)}{Array.from({length:Math.max(0,slots-images.length)},(_,index) => <li className="photo-empty-slot" key={`empty-${index}`}>
      {index === 0 ? <button className="photo-add" type="button" disabled={locked} aria-label="Agregar fotos" onClick={() => gallery.current?.click()}><ImagePlus size={28} aria-hidden="true" /><span>Agregar fotos</span></button> : <span className="photo-slot-number" aria-hidden="true">{images.length+index+1}</span>}
    </li>)}</ol>
    <div className="photo-upload-actions">
      <button type="button" disabled={locked || images.length >= 7} onClick={() => camera.current?.click()}><Camera size={20} aria-hidden="true" />Tomar foto</button>
    </div>
    <p className="photo-camera-help">También puedes ordenar con las flechas ← → al enfocar una foto. La cámara depende de tu dispositivo.</p>
    {announcement && <span className="photo-sr-only" role="status">{announcement}</span>}
    {uploading && <p role="status">Preparando y subiendo fotos…</p>}
    {error && <p role="alert">{error}</p>}
    {cropBlob && <PhotoCropDialog blob={cropBlob} onConfirm={finishCrop} onCancel={()=>finishCrop(null)} />}
  </section>;
}
