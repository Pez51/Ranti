import { apiBlob } from './api';
export const isPrivateProvenance=ref=>typeof ref==='string'&&/^\/api\/publications\/provenance\/[0-9a-f-]{36}$/i.test(ref);
export async function downloadProvenance(ref,token){
  if(!isPrivateProvenance(ref))throw new Error('La boleta no está en el almacenamiento privado.');
  const blob=await apiBlob(ref.replace(/^\/api/,''),{token});
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download=`boleta.${blob.type==='application/pdf'?'pdf':blob.type==='image/png'?'png':blob.type==='image/jpeg'?'jpg':'webp'}`;
  document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
