import { User, Clock, AlertCircle, ShieldCheck, MapPin, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function UserProfile() {
  return (
    <div className="py-6 max-w-5xl mx-auto space-y-8">
      
      {/* Cabecera del Perfil */}
      <div className="bg-green-gradient p-8 md:p-12 rounded-3xl border-4 border-ranti-ink shadow-solid flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
        {/* Decoración geométrica */}
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white opacity-20 rounded-full border-4 border-ranti-ink"></div>
        
        <div className="w-32 h-32 bg-pink-200 rounded-full border-4 border-ranti-ink shadow-solid-sm overflow-hidden flex-shrink-0 relative z-10">
          <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Avatar" className="w-full h-full object-cover" />
        </div>
        
        <div className="text-center md:text-left relative z-10 text-white">
          <div className="flex items-center justify-center md:justify-start gap-2 mb-2">
            <span className="bg-yellow-300 text-ranti-ink text-xs font-bold px-3 py-1 rounded-full border-2 border-ranti-ink uppercase tracking-widest">Estudiante</span>
            <span className="flex items-center gap-1 text-sm font-bold bg-ranti-dark px-3 py-1 rounded-full border-2 border-ranti-ink">
              <ShieldCheck size={14}/> Verificado
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-2" style={{ textShadow: '2px 2px 0 #062912' }}>Felix UCSM</h2>
          <p className="font-body font-bold text-lg flex items-center justify-center md:justify-start gap-2">
            <MapPin size={18}/> Facultad de Ingeniería Civil
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Columna Izquierda: Métricas */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid">
            <h3 className="font-display font-bold text-xl text-ranti-ink mb-4 flex items-center gap-2">
              <User size={20}/> Mi Reputación
            </h3>
            <div className="flex items-end gap-2 mb-2">
              <span className="text-5xl font-display font-bold text-ranti-ink">4.9</span>
              <span className="text-gray-500 font-bold mb-1">/ 5.0 ⭐</span>
            </div>
            <p className="text-sm font-bold text-gray-500">Basado en 8 operaciones (entregas a tiempo y cuidado del equipo).</p>
          </div>

          <Link to="/oferente" className="block bg-ranti-light p-6 rounded-3xl border-4 border-ranti-ink shadow-solid hover:-translate-y-1 hover:shadow-solid-hover transition-all group">
            <h3 className="font-display font-bold text-xl text-ranti-ink mb-2">Modo Oferente</h3>
            <p className="text-sm font-bold text-gray-600 mb-4">Cambia a tu panel de ventas y alquileres publicados.</p>
            <span className="inline-block bg-ranti-ink text-white px-4 py-2 rounded-xl border-2 border-ranti-ink font-bold text-sm group-hover:bg-gray-800 transition-colors">
              Ir a Mi Panel de Oferente →
            </span>
          </Link>
        </div>

        {/* Columna Derecha: Equipos en mi poder (Demandante) */}
        <div className="md:col-span-2 space-y-6">
          <h3 className="text-2xl font-display font-bold text-ranti-ink flex items-center gap-2">
            <Clock size={24} strokeWidth={2.5}/> Equipos en mi poder (Alquileres Activos)
          </h3>
          
          <div className="bg-white rounded-3xl border-4 border-ranti-ink shadow-solid overflow-hidden">
            {/* Item 1: Activo y a tiempo */}
            <div className="p-6 border-b-4 border-ranti-ink hover:bg-gray-50 transition-colors flex flex-col sm:flex-row gap-6 items-start sm:items-center">
              <div className="w-24 h-24 bg-blue-100 rounded-2xl border-4 border-ranti-ink flex-shrink-0"></div>
              <div className="flex-grow">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-display font-bold text-xl text-ranti-ink leading-tight">Estación Total Leica TS06</h4>
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full border-2 border-blue-800 flex items-center gap-1">
                    <CalendarDays size={12}/> En Uso
                  </span>
                </div>
                <p className="text-sm font-bold text-gray-500 mb-3">Dueño: Carlos Mendoza</p>
                <div className="flex items-center gap-2 text-sm font-bold bg-yellow-100 text-yellow-800 px-3 py-2 rounded-xl border-2 border-yellow-300 w-fit">
                  <AlertCircle size={16}/> Devolver mañana antes de las 18:00
                </div>
              </div>
              <Link to="/entrega/1" className="w-full sm:w-auto text-center bg-white text-ranti-ink px-4 py-3 rounded-xl border-4 border-ranti-ink font-bold hover:bg-gray-100 transition-colors">
                Generar OTP de Devolución
              </Link>
            </div>

            {/* Historial vacío o sin más elementos */}
            <div className="p-6 text-center bg-gray-50">
              <p className="font-bold text-gray-400">No tienes más equipos alquilados o prestados actualmente.</p>
              <Link to="/" className="text-ranti-secondary hover:text-ranti-primary font-bold underline underline-offset-4 mt-2 inline-block">
                Explorar el catálogo
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}