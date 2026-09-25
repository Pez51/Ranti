import { NavLink } from 'react-router-dom';

export default function SubNav() {
  const activeLinkStyle = ({ isActive }) => 
    `transition-colors underline-offset-4 hover:underline whitespace-nowrap px-2 py-1 ${
      isActive 
        ? 'text-[#4ADE80] font-black' 
        : 'text-ranti-ink hover:text-ranti-secondary'
    }`;

  return (
    <nav className="bg-white border-b-4 border-ranti-ink py-3 shadow-sm w-full">
      {/* Contenedor responsivo: Scroll horizontal en móviles, centrado en escritorio */}
      <div className="container mx-auto px-4 flex gap-6 overflow-x-auto hide-scrollbar text-sm md:text-base font-display font-bold md:justify-center">
        
        <NavLink to="/" className={activeLinkStyle} end>Inicio</NavLink>
        
        {/* Separador visual */}
        <div className="w-1 h-6 bg-gray-200 rounded-full hidden md:block"></div>
        
        <NavLink to="/modalidad/alquiler" className={activeLinkStyle}>Alquiler Rápido</NavLink>
        <NavLink to="/modalidad/venta" className={activeLinkStyle}>Venta de Segunda</NavLink>
        <NavLink to="/modalidad/prestamo" className={activeLinkStyle}>Préstamo Solidario</NavLink>
        
        <div className="w-1 h-6 bg-gray-200 rounded-full hidden md:block"></div>
        
        <NavLink to="/facultad/arquitectura" className={activeLinkStyle}>Arquitectura</NavLink>
        <NavLink to="/facultad/sistemas" className={activeLinkStyle}>Ing. de Sistemas</NavLink>
      </div>
    </nav>
  );
}