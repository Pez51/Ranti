import { createContext, useContext } from 'react';

export const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('El componente debe estar dentro del proveedor de avisos.');
  return context;
}
