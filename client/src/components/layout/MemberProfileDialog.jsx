import { useEffect,useRef,useState } from 'react';
import { apiRequest } from '../../lib/api';
import UserAvatar from './UserAvatar';
import { X } from 'lucide-react';
export default function MemberProfileDialog({id,token,onClose}){
  const dialog=useRef(null),[profile,setProfile]=useState(null),[error,setError]=useState('');
  useEffect(()=>{
    const element=dialog.current,previous=document.activeElement,controller=new AbortController();
    element.showModal();
    apiRequest(`/users/${id}/profile`,{token,signal:controller.signal}).then(setProfile).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return()=>{controller.abort();element.close();previous?.focus();};
  },[id,token]);
  const score=Number(profile?.reputation_score);
  return <dialog ref={dialog} className="member-profile-dialog" aria-label="Perfil del usuario" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <button type="button" className="member-profile-close" aria-label="Cerrar perfil" onClick={onClose}><X size={20}/></button>
    {error?<p role="alert">{error}</p>:!profile?<p>Cargando perfil…</p>:<>
      <span className="member-profile-photo"><UserAvatar user={profile}/></span><h2>{profile.display_name||'Usuario UCSM'}</h2><p>{profile.role} · UCSM</p>
      <p>{Number(profile.operations_count)>0&&Number.isFinite(score)?`★ ${score.toFixed(1)} / 5`:'Sin calificaciones todavía'} · {profile.operations_count||0} operaciones</p>
      <dl><dt>Correo</dt><dd><a href={`mailto:${profile.email}`}>{profile.email}</a></dd><dt>Teléfono</dt><dd>{profile.contact_number||'No indicado'}</dd>
        {profile.faculty&&<><dt>Facultad</dt><dd>{profile.faculty}</dd></>}{profile.career&&<><dt>Carrera</dt><dd>{profile.career}</dd></>}
      </dl>
    </>}
  </dialog>;
}
