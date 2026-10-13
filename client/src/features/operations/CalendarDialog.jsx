import { useContext,useEffect,useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import DealCalendar from './DealCalendar';
import { ToastContext } from '../../lib/toast-context';

export default function CalendarDialog({deals,token,title,onClose}){
  const dialog=useRef(null);
  const toast=useContext(ToastContext);
  function saved(message){toast?.showSuccessToast(message);onClose();}
  useEffect(()=>{
    const element=dialog.current,previous=document.activeElement;
    element.showModal();
    return()=>{element.close();previous?.focus();};
  },[]);
  return createPortal(<dialog ref={dialog} className="chat-calendar-dialog workflow" aria-labelledby="chat-calendar-title" onCancel={onClose}>
    <header><div><h1 id="chat-calendar-title">Coordinar el encuentro</h1><p>{title}</p></div><button type="button" aria-label="Cerrar calendario y volver al chat" onClick={onClose}><X size={22}/></button></header>
    <p>Elijan sus horarios y acuerden juntos el lugar y la hora. Abrir el calendario no confirma el encuentro.</p>
    {deals.map(deal=><DealCalendar key={deal.id} deal={deal} token={token} defaultOpen onSaved={saved}/>)}
  </dialog>,document.body);
}
