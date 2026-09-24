import { MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SubNav() {
  return (
    <nav className="bg-white border-b-4 border-ranti-ink py-2 overflow-x-auto whitespace-nowrap shadow-sm">
      <div className="container mx-auto px-4 flex items-center gap-6 font-display font-bold text-sm md:text-base">
        
        {/* Ubicación Campus */}
        <div className="flex items-center gap-1 text-ranti-dark border-r-4 border-ranti-ink pr-6">
          <MapPin size={18} strokeWidth={2.5} /> 
          <span>Campus Central UCSM</span>
        </div>
        
        {/* Enlaces de acceso rápido */}
        <Link to="/modalidad/alquiler" className="hover:text-ranti-secondary transition-colors underline-offset-4 hover:underline">Alquiler Rápido</Link>
        <Link to="/modalidad/venta" className="hover:text-ranti-secondary transition-colors underline-offset-4 hover:underline">Venta de Segunda</Link>
        <Link to="/modalidad/prestamo" className="hover:text-ranti-secondary transition-colors underline-offset-4 hover:underline text-ranti-primary">Préstamo Solidario</Link>
        <Link to="/facultad/arquitectura" className="hover:text-ranti-secondary transition-colors underline-offset-4 hover:underline">Arquitectura</Link>
        <Link to="/facultad/sistemas" className="hover:text-ranti-secondary transition-colors underline-offset-4 hover:underline">Ing. de Sistemas</Link>
      </div>
    </nav>
  );
}