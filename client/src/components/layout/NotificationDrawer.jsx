import { X, ShoppingBag, AlertCircle, Info, CheckCircle } from 'lucide-react';
import { useState } from 'react';

// Datos simulados de notificaciones
const mockNotifications = [
  {
    id: 1,
    type: 'transaction',
    title: '¡Nueva solicitud de alquiler!',
    message: 'Juan Pérez quiere alquilar tu Estación Total del 12 al 15 de Octubre.',
    time: 'Hace 10 min',
    unread: true,
    icon: <ShoppingBag size={20} className="text-white" />,
    color: 'bg-ranti-secondary',
    actionText: 'Ver solicitud'
  },
  {
    id: 2,
    type: 'alert',
    title: 'Alerta de Catálogo',
    message: 'Se ha publicado una nueva "Calculadora Gráfica HP" en la Facultad de Ingeniería.',
    time: 'Hace 2 horas',
    unread: true,
    icon: <AlertCircle size={20} className="text-ranti-ink" />,
    color: 'bg-yellow-300',
    actionText: 'Ver equipo'
  },
  {
    id: 3,
    type: 'system',
    title: 'Pago Liberado',
    message: 'La garantía de S/ 50.00 ha sido devuelta a tu cuenta exitosamente.',
    time: 'Ayer',
    unread: false,
    icon: <CheckCircle size={20} className="text-white" />,
    color: 'bg-ranti-dark',
    actionText: null
  }
];

export default function NotificationDrawer({ isOpen, onClose }) {
  const [filter, setFilter] = useState('todas');

  return (
    <>
      {/* Fondo oscuro (Overlay) para cerrar al hacer clic afuera */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-ranti-ink bg-opacity-40 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Contenedor del Panel Desplegable */}
      <div 
        className={`fixed top-0 right-0 h-full w-full max-w-sm sm:max-w-md bg-[#FDFBF7] border-l-4 border-ranti-ink z-50 transform transition-transform duration-300 ease-in-out shadow-[-8px_0_0_0_#062912] flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Cabecera del Panel */}
        <div className="p-4 md:p-6 border-b-4 border-ranti-ink bg-white flex justify-between items-center">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2 text-ranti-ink">
            Notificaciones
            <span className="bg-red-500 text-white text-sm px-2 py-0.5 rounded-full border-2 border-ranti-ink">3</span>
          </h2>
          <button 
            onClick={onClose}
            className="p-1 bg-gray-100 hover:bg-yellow-300 rounded-full border-4 border-transparent hover:border-ranti-ink hover:shadow-solid-sm transition-all active:translate-y-1 active:shadow-none"
          >
            <X size={24} className="text-ranti-ink" strokeWidth={3} />
          </button>
        </div>

        {/* Filtros tipo "Píldora" */}
        <div className="p-4 border-b-4 border-ranti-ink bg-gray-50 flex gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar">
          {['todas', 'transacciones', 'alertas', 'sistema'].map((f) => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full border-2 border-ranti-ink font-bold text-sm capitalize transition-all ${
                filter === f 
                  ? 'bg-ranti-ink text-white shadow-solid-sm translate-y-[-2px]' 
                  : 'bg-white text-ranti-ink hover:bg-gray-100'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Lista de Notificaciones */}
        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {mockNotifications.map((notif) => (
            <div 
              key={notif.id} 
              className={`p-4 rounded-2xl border-4 border-ranti-ink transition-all ${
                notif.unread ? 'bg-white shadow-solid-sm' : 'bg-gray-100 opacity-75'
              }`}
            >
              <div className="flex gap-4">
                <div className={`mt-1 h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-full border-2 border-ranti-ink ${notif.color}`}>
                  {notif.icon}
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-display font-bold text-lg leading-tight text-ranti-ink">{notif.title}</h4>
                    {notif.unread && <span className="h-3 w-3 bg-red-500 rounded-full border-2 border-ranti-ink flex-shrink-0 ml-2"></span>}
                  </div>
                  <p className="text-sm font-body font-semibold text-gray-600 mb-2">{notif.message}</p>
                  
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs font-bold text-gray-400">{notif.time}</span>
                    {notif.actionText && (
                      <button className="text-xs font-bold bg-ranti-secondary text-white px-3 py-1.5 rounded-lg border-2 border-ranti-ink hover:bg-ranti-primary active:scale-95 transition-all">
                        {notif.actionText}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Footer del Panel */}
        <div className="p-4 border-t-4 border-ranti-ink bg-white text-center">
          <button className="text-sm font-bold text-gray-500 hover:text-ranti-ink underline underline-offset-2">
            Marcar todas como leídas
          </button>
        </div>
      </div>
    </>
  );
}