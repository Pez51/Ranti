import { MapPin } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export default function SubNav() {
  // Función que determina el estilo: verde claro si está activo, normal si no lo está.
  const activeLinkStyle = ({ isActive }) => 
    `transition-colors underline-offset-4 hover:underline ${
      isActive 
        ? 'text-[#4ADE80] font-black' // El color verde claro de la imagen para la pestaña activa
        : 'text-ranti-ink hover:text-ranti-secondary' // Color normal
    }`;

  return (
    <nav className="bg-white border-b-4 border-ranti-ink py-2 overflow-x-auto whitespace-nowrap shadow-sm">
      <div className="container mx-auto px-4 flex items-center gap-6 font-display font-bold text-sm md:text-base">
        
        {/* Ubicación Campus */}
        <div className="flex items-center gap-1 text-ranti-dark border-r-4 border-ranti-ink pr-6">
          <MapPin size={18} strokeWidth={2.5} /> 
          <span>Campus Central UCSM</span>
        </div>
        
        {/* Enlaces con estilos dinámicos */}
        <NavLink to="/modalidad/alquiler" className={activeLinkStyle}>
          Alquiler Rápido
        </NavLink>
        <NavLink to="/modalidad/venta" className={activeLinkStyle}>
          Venta de Segunda
        </NavLink>
        <NavLink to="/modalidad/prestamo" className={activeLinkStyle}>
          Préstamo Solidario
        </NavLink>
        <NavLink to="/facultad/arquitectura" className={activeLinkStyle}>
          Arquitectura
        </NavLink>
        <NavLink to="/facultad/sistemas" className={activeLinkStyle}>
          Ing. de Sistemas
        </NavLink>
      </div>
    </nav>
  );
}