import { X, Package, ShieldCheck, LogOut, LogIn, Grid } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function MenuDrawer({ isOpen, onClose, isLoggedIn }) {
  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-ranti-ink bg-opacity-40 z-40 transition-opacity" onClick={onClose} />}

      <div className={`fixed top-0 left-0 h-full w-full max-w-sm bg-[#FDFBF7] border-r-4 border-ranti-ink z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0 shadow-[8px_0_0_0_#062912]' : '-translate-x-full'}`}>
        
        <div className="p-6 border-b-4 border-ranti-ink bg-green-gradient flex justify-between items-center">
          {isLoggedIn ? (
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-pink-200 rounded-full border-4 border-ranti-ink shadow-solid-sm overflow-hidden">
                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Perfil" />
              </div>
              <div>
                <p className="font-display font-bold text-white leading-tight">Felix UCSM</p>
                <p className="text-xs font-bold text-ranti-ink bg-yellow-300 px-2 py-0.5 rounded-full inline-block border-2 border-ranti-ink mt-1">Estudiante</p>
              </div>
            </div>
          ) : (
            <h2 className="text-3xl font-display font-bold text-white">Menú</h2>
          )}
          <button onClick={onClose} className="p-1 bg-white hover:bg-yellow-300 rounded-full border-4 border-ranti-ink transition-all">
            <X size={24} strokeWidth={3} />
          </button>
        </div>

        <nav className="flex-grow p-6 space-y-4 overflow-y-auto">
          {isLoggedIn ? (
            <Link to="/oferente" onClick={onClose} className="flex items-center gap-4 p-4 bg-yellow-300 rounded-2xl border-4 border-ranti-ink font-bold text-lg hover:-translate-y-1 hover:shadow-solid-sm transition-all">
              <Package size={24} /> Mi Panel de Control
            </Link>
          ) : (
            <Link to="/login" onClick={onClose} className="flex items-center gap-4 p-4 bg-white rounded-2xl border-4 border-ranti-ink font-bold text-lg hover:bg-gray-100 hover:-translate-y-1 hover:shadow-solid-sm transition-all">
              <LogIn size={24} /> Iniciar Sesión
            </Link>
          )}

          <div className="pt-4 pb-2">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Navegación Rápida</p>
          </div>

          <Link to="/?q=arquitectura" onClick={onClose} className="flex items-center gap-4 p-4 bg-white rounded-2xl border-4 border-ranti-ink font-bold text-gray-700 hover:bg-gray-50 transition-all">
            <Grid size={20} /> Equipos Arquitectura
          </Link>
          <Link to="/?q=sistemas" onClick={onClose} className="flex items-center gap-4 p-4 bg-white rounded-2xl border-4 border-ranti-ink font-bold text-gray-700 hover:bg-gray-50 transition-all">
            <Grid size={20} /> Equipos Sistemas
          </Link>
          <Link to="/reclamaciones" onClick={onClose} className="flex items-center gap-4 p-4 bg-white rounded-2xl border-4 border-ranti-ink font-bold text-gray-700 hover:bg-red-50 transition-all">
            <ShieldCheck size={20} /> Ayuda y Soporte
          </Link>
        </nav>

        {isLoggedIn && (
          <div className="p-6 border-t-4 border-ranti-ink bg-white">
            <button onClick={onClose} className="w-full flex justify-center items-center gap-2 bg-white text-red-600 px-6 py-4 rounded-xl border-4 border-ranti-ink font-bold hover:bg-red-50 transition-all">
              <LogOut size={20} /> Cerrar Sesión
            </button>
          </div>
        )}
      </div>
    </>
  );
}