import { MapPinOff, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="bg-red-100 w-32 h-32 rounded-full border-4 border-ranti-ink flex items-center justify-center mb-6 relative shadow-solid">
        <MapPinOff size={64} className="text-red-500" strokeWidth={2.5} />
        {/* Signo de interrogación decorativo */}
        <span className="absolute -top-4 -right-4 bg-yellow-300 w-12 h-12 rounded-full border-4 border-ranti-ink flex items-center justify-center font-display font-black text-2xl text-ranti-ink">
          ?
        </span>
      </div>
      
      <h1 className="text-7xl md:text-9xl font-display font-black text-ranti-ink mb-4" style={{ textShadow: '4px 4px 0 #4ADE80' }}>
        404
      </h1>
      
      <h2 className="text-2xl md:text-3xl font-display font-bold text-ranti-ink mb-4">
        ¡Ups! Te saliste del campus.
      </h2>
      
      <p className="text-lg font-body font-bold text-gray-500 max-w-md mb-8">
        La página o el equipo que estás buscando no existe, ha sido retirado o te has equivocado de ruta.
      </p>
      
      <Link to="/" className="bg-ranti-ink text-white px-8 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all flex items-center gap-2">
        <ArrowLeft size={20} strokeWidth={3} />
        Volver al Catálogo
      </Link>
    </div>
  );
}