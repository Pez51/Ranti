import { X, Bell, DollarSign, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function NotificationDrawer({ isOpen, onClose }) {
  const [filter, setFilter] = useState('todas');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar notificaciones reales desde el backend
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token'); // Asume que guardaste el token aquí en el Login
      const response = await fetch('http://localhost:3000/api/notifications', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3000/api/notifications/${id}/read`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        // Actualizar el estado local para reflejar el cambio sin recargar todo
        setNotifications(prev => 
          prev.map(notif => notif.id === id ? { ...notif, status: 'Leida' } : notif)
        );
      }
    } catch (error) {
      console.error('Error marcando como leída:', error);
    }
  };

  const getIcon = (type) => {
    switch(type) {
      case 'Transaccion': return <DollarSign size={20} className="text-green-600" />;
      case 'Alerta': return <AlertTriangle size={20} className="text-yellow-600" />;
      default: return <Info size={20} className="text-blue-600" />;
    }
  };

  const unreadCount = notifications.filter(n => n.status === 'No leida').length;
  const filteredNotifications = notifications.filter(n => filter === 'todas' || n.type.toLowerCase() === filter);

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-ranti-ink bg-opacity-40 z-40 transition-opacity" onClick={onClose} />}

      <div className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md bg-[#FDFBF7] border-l-4 border-ranti-ink z-50 transform transition-transform duration-300 ease-in-out shadow-[-8px_0_0_0_#062912] flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        <div className="p-4 md:p-6 border-b-4 border-ranti-ink bg-white flex justify-between items-center">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2 text-ranti-ink">
            Notificaciones
            {unreadCount > 0 && (
              <span className="bg-red-500 text-white text-sm px-2 py-0.5 rounded-full border-2 border-ranti-ink">{unreadCount}</span>
            )}
          </h2>
          <button onClick={onClose} className="p-1 bg-gray-100 hover:bg-yellow-300 rounded-full border-4 border-transparent hover:border-ranti-ink hover:shadow-solid-sm transition-all">
            <X size={24} className="text-ranti-ink" strokeWidth={3} />
          </button>
        </div>

        <div className="p-4 border-b-4 border-ranti-ink bg-gray-50 flex gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar">
          {['todas', 'transaccion', 'alerta', 'sistema'].map((f) => (
            <button 
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full border-2 border-ranti-ink font-bold text-sm capitalize transition-all ${filter === f ? 'bg-ranti-ink text-white shadow-solid-sm -translate-y-0.5' : 'bg-white text-ranti-ink hover:bg-gray-100'}`}
            >
              {f === 'transaccion' ? 'transacciones' : f === 'alerta' ? 'alertas' : f}
            </button>
          ))}
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {loading ? (
            <p className="text-center text-gray-500 font-bold mt-10">Cargando alertas...</p>
          ) : filteredNotifications.length > 0 ? (
            filteredNotifications.map((notif) => (
              <div key={notif.id} className={`p-4 rounded-2xl border-4 border-ranti-ink transition-all ${notif.status === 'No leida' ? 'bg-white shadow-solid-sm' : 'bg-gray-100 opacity-75'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="bg-white p-1.5 rounded-lg border-2 border-ranti-ink">{getIcon(notif.type)}</div>
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{notif.type}</span>
                  </div>
                  <span className="text-xs font-bold text-gray-400">
                    {new Date(notif.created_at).toLocaleDateString()}
                  </span>
                </div>
                <h4 className="font-bold text-ranti-ink leading-tight mb-1">{notif.title}</h4>
                <p className="text-sm font-semibold text-gray-600 mb-3">{notif.message}</p>
                {notif.status === 'No leida' && (
                  <button onClick={() => handleMarkAsRead(notif.id)} className="text-xs font-bold flex items-center gap-1 text-ranti-ink hover:text-ranti-primary transition-colors">
                    <CheckCircle2 size={14} /> Marcar como leída
                  </button>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-10">
              <Bell size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="font-bold text-gray-500">No tienes notificaciones aquí.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}