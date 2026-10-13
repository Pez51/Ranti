import { useEffect, useRef, useState } from 'react';
import { RotateCcw, ZoomIn } from 'lucide-react';
import { photoCropRect, cropClamp as clamp } from '../../lib/photo-crop';

export default function PhotoCropDialog({ blob, onConfirm, onCancel }) {
  const dialog = useRef(null); const image = useRef(null); const stage = useRef(null); const pointer = useRef(null);
  const [dimensions,setDimensions] = useState(null);
  const [zoom,setZoom] = useState(1);
  const [center,setCenter] = useState({x:.5,y:.5});
  const [saving,setSaving] = useState(false); const [error,setError] = useState('');
  const savingRef=useRef(false);
  useEffect(() => {
    const url=URL.createObjectURL(blob); image.current.src=url;
    const previous=document.activeElement;
    const modal=dialog.current;
    if(!modal.open) modal.showModal();
    return () => { modal.close?.(); URL.revokeObjectURL(url); previous?.focus?.(); };
  },[blob]);
  const crop=dimensions ? photoCropRect(dimensions.width,dimensions.height,zoom,center) : null;
  function position(x,y) {
    setCenter({x:(clamp(x,0,dimensions.width-crop.side)+crop.side/2)/dimensions.width,
      y:(clamp(y,0,dimensions.height-crop.side)+crop.side/2)/dimensions.height});
  }
  async function confirm() {
    if (!crop || savingRef.current) return;
    savingRef.current=true; setSaving(true); setError('');
    try {
      const canvas=document.createElement('canvas');
      canvas.width=canvas.height=Math.max(1,Math.min(1600,Math.round(crop.side)));
      const context=canvas.getContext('2d');
      if (!context) throw new Error('Tu navegador no permite ajustar la foto.');
      context.drawImage(image.current,crop.x,crop.y,crop.side,crop.side,0,0,canvas.width,canvas.height);
      const result=await new Promise((resolve,reject)=>canvas.toBlob(value=>value ? resolve(value) : reject(new Error('No se pudo recortar la foto.')),'image/webp',.9));
      onConfirm(result);
    } catch (failure) { setError(failure.message); savingRef.current=false; setSaving(false); }
  }
  return <dialog ref={dialog} className="photo-crop-dialog" aria-labelledby="photo-crop-title" aria-describedby="photo-crop-help"
    onCancel={event=>{event.preventDefault(); if(!savingRef.current) onCancel();}}>
    <h2 id="photo-crop-title">Acomodar foto</h2>
    <p id="photo-crop-help">Arrastra la imagen y ajusta el zoom. Solo se guardará lo que ves dentro del cuadrado.</p>
    <div ref={stage} className="photo-crop-stage" role="group" tabIndex={0} aria-label="Encuadre de la foto; arrastra o usa las flechas para moverla"
      onPointerDown={event=>{
        if(!crop || saving || (event.pointerType==='mouse' && event.button!==0)) return;
        pointer.current={x:event.clientX,y:event.clientY,crop,scale:crop.side/stage.current.getBoundingClientRect().width};
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }} onPointerMove={event=>{
        if(!pointer.current || saving) return;
        const start=pointer.current;
        position(start.crop.x-(event.clientX-start.x)*start.scale,start.crop.y-(event.clientY-start.y)*start.scale);
      }} onPointerUp={()=>{pointer.current=null;}} onPointerCancel={()=>{pointer.current=null;}}
      onKeyDown={event=>{
        if(!crop || saving || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
        event.preventDefault(); const step=crop.side*.04;
        position(crop.x+(event.key==='ArrowLeft'?step:event.key==='ArrowRight'?-step:0),crop.y+(event.key==='ArrowUp'?step:event.key==='ArrowDown'?-step:0));
      }}>
      <img ref={image} draggable={false} alt="Vista previa del recorte" onLoad={event=>setDimensions({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})}
        onError={()=>setError('No se pudo abrir la foto. Selecciona otra imagen.')}
        style={crop ? {width:`${dimensions.width/crop.side*100}%`,height:`${dimensions.height/crop.side*100}%`,left:`${-crop.x/crop.side*100}%`,top:`${-crop.y/crop.side*100}%`} : {visibility:'hidden'}} />
      <span className="photo-crop-grid" aria-hidden="true" />
    </div>
    <label className="photo-crop-zoom"><ZoomIn size={18} aria-hidden="true" />Zoom<input type="range" min="1" max="3" step="0.01" value={zoom} disabled={!crop || saving} onChange={event=>{pointer.current=null;setZoom(Number(event.target.value));}} /></label>
    <button type="button" disabled={saving} onClick={()=>{setZoom(1);setCenter({x:.5,y:.5});}}><RotateCcw size={16} aria-hidden="true" />Centrar de nuevo</button>
    {error && <p role="alert">{error}</p>}
    <div className="photo-crop-actions"><button type="button" disabled={saving} onClick={onCancel}>Cancelar</button><button className="photo-crop-confirm" type="button" disabled={!crop || saving || Boolean(error)} onClick={confirm}>{saving?'Aplicando…':'Usar este encuadre'}</button></div>
  </dialog>;
}
