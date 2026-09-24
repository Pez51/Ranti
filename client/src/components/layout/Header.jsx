import { Search, Menu, ShoppingCart, User, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import NotificationDrawer from './NotificationDrawer';

export default function Header() {
  // DECLARACIÓN FALTANTE: Inicializa el estado del panel
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  return (
    <>
      <div className="w-full bg-ranti-dark pb-2 border-b-4 border-ranti-ink">
        {/* Capa intermedia para dar efecto de profundidad 3D */}
        <div className="w-full bg-ranti-secondary pb-2 border-b-4 border-ranti-ink rounded-b-3xl">
          
          {/* Capa principal del Header */}
          <header className="bg-green-gradient px-4 py-4 rounded-b-3xl border-b-4 border-ranti-ink flex flex-col gap-4">
            
            {/* Fila Superior: Menú, Logo y Acciones de Usuario */}
            <div className="container mx-auto flex items-center justify-between">
              
              {/* Botón Menú Hamburguesa */}
              <button className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover transition-all font-display font-bold active:translate-y-1 active:shadow-solid-sm">
                <Menu size={20} />
                <span className="hidden md:inline">MENÚ</span>
              </button>

              {/* Logo Central (Efecto de texto contorneado con text-shadow) */}
              <Link to="/" className="text-4xl md:text-5xl font-display font-bold text-white tracking-wide hover:scale-105 transition-transform" 
                    style={{ textShadow: '3px 3px 0 #062912, -1px -1px 0 #062912, 1px -1px 0 #062912, -1px 1px 0 #062912, 1px 1px 0 #062912' }}>
                ranti
              </Link>

              {/* Acciones de la derecha */}
              <div className="flex gap-2 md:gap-4">
                
                {/* Botón de Notificaciones */}
                <button 
                  onClick={() => setIsNotifOpen(true)}
                  className="bg-yellow-300 text-ranti-ink p-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-yellow-400 transition-all relative active:translate-y-1 active:shadow-solid-sm" 
                  aria-label="Notificaciones"
                >
                  <Bell size={20} strokeWidth={2.5} />
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-ranti-ink">
                    3
                  </span>
                </button>
                
                {/* Carrito de Compras / Reservas Pendientes */}
                <button className="bg-white text-ranti-ink p-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-gray-100 transition-all active:translate-y-1 active:shadow-solid-sm" aria-label="Carrito">
                  <ShoppingCart size={20} strokeWidth={2.5} />
                </button>

                {/* Contenedor temporal para los botones de usuario */}
                <div className="hidden sm:flex gap-2">
                  <Link to="/oferente" className="bg-ranti-dark text-white p-2 md:px-6 md:py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-ranti-ink transition-all font-display font-bold flex items-center gap-2 active:translate-y-1 active:shadow-solid-sm">
                    <User size={20} />
                    <span className="hidden md:inline">MI PANEL</span>
                  </Link>

                  <Link to="/perfil" className="bg-white text-ranti-ink p-2 md:px-6 md:py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-gray-100 transition-all font-display font-bold flex items-center gap-2 active:translate-y-1 active:shadow-solid-sm">
                    <User size={20} />
                    <span className="hidden md:inline">INGRESAR</span>
                  </Link>
                </div>
              </div>
            </div>

            {/* Fila Inferior: Barra de Búsqueda tipo Amazon */}
            <div className="container mx-auto pb-2">
              <div className="flex w-full md:w-3/4 lg:w-1/2 mx-auto bg-white rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden focus-within:shadow-solid-hover transition-all focus-within:-translate-y-1">
                
                {/* Selector de Categorías */}
                <select className="bg-gray-100 border-r-4 border-ranti-ink px-4 py-3 font-bold text-sm outline-none cursor-pointer hidden sm:block">
                  <option>Todo Ranti</option>
                  <option>Alquileres</option>
                  <option>Ventas</option>
                  <option>Préstamos</option>
                  <option>Equipos Topográficos</option>
                  <option>Electrónica</option>
                </select>
                
                {/* Input de Búsqueda */}
                <input 
                  type="text" 
                  placeholder="Busca instrumentales, calculadoras, cámaras..." 
                  className="flex-grow px-4 py-3 outline-none font-body font-bold text-ranti-ink placeholder-gray-400"
                />
                
                {/* Botón Lupa */}
                <button className="bg-ranti-secondary px-6 py-3 border-l-4 border-ranti-ink hover:bg-ranti-primary transition-colors flex items-center justify-center">
                  <Search className="text-ranti-ink" size={24} strokeWidth={3} />
                </button>
              </div>
            </div>
          </header>
          
        </div>
      </div>

      {/* MONTAR EL DRAWER AFUERA DEL DOM DEL HEADER */}
      <NotificationDrawer 
        isOpen={isNotifOpen} 
        onClose={() => setIsNotifOpen(false)} 
      />
    </>
  );
}