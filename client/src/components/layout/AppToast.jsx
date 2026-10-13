import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Info, X } from 'lucide-react';
import { ToastContext } from '../../lib/toast-context';

export default function AppToast({ children }) {
  const [toast, setToast] = useState(null);
  const showSuccessToast = useCallback(message => setToast({ message }), []);
  const showInfoToast = useCallback(message => setToast({ message,type:'info' }), []);
  const value = useMemo(() => ({ showSuccessToast,showInfoToast }), [showSuccessToast,showInfoToast]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timeout);
  }, [toast]);

  return <ToastContext.Provider value={value}>{children}{toast &&
    <div className="app-toast" role="status" aria-live="polite" aria-atomic="true">
    {toast.type==='info'?<Info aria-hidden="true" size={28}/>:<CheckCircle2 aria-hidden="true" size={28} />}
    <div><strong>{toast.type==='info'?'Un consejo de Ranti':'¡Listo!'}</strong><p>{toast.message}</p></div>
    <button type="button" onClick={() => setToast(null)} aria-label={toast.type==='info'?'Cerrar consejo':'Cerrar confirmación'}>
      <X aria-hidden="true" size={20} />
    </button>
  </div>}</ToastContext.Provider>;
}
