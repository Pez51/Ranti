import { Calendar, ShieldCheck, MapPin, User, AlertCircle } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';

export default function ProductDetail() {
  const { id } = useParams(); // Captura el ID de la URL

  return (
    <div className="py-6 max-w-6xl mx-auto">
      
      {/* Botón volver */}
      <Link to="/" className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 border-2 border-transparent hover:border-ranti-ink px-4 py-2 rounded-full transition-all">
        ← Volver al catálogo
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COLUMNA IZQUIERDA: Fotos e Información */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Galería / Imagen Principal */}
          <div className="bg-blue-50 aspect-video rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center justify-center relative overflow-hidden">
            <span className="absolute top-4 left-4 bg-yellow-300 text-ranti-ink text-sm font-display font-bold px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid-sm">
              Alquiler
            </span>
            <span className="text-6xl font-display font-bold text-ranti-ink opacity-20">
              FOTO PRINCIPAL
            </span>
          </div>

          {/* Información del Equipo */}
          <div className="bg-white p-8 rounded-3xl border-4 border-ranti-ink shadow-solid">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-ranti-light text-ranti-dark font-bold text-xs px-3 py-1 rounded-full border-2 border-ranti-ink uppercase">
                Ing. Civil
              </span>
              <span className="text-gray-500 font-bold text-sm flex items-center gap-1">
                <MapPin size={16}/> Campus Central
              </span>
            </div>
            
            <h1 className="text-4xl font-display font-bold text-ranti-ink mb-4 leading-tight">
              Estación Total Topográfica Leica TS06 (Equipo {id})
            </h1>
            
            <p className="text-lg font-body font-semibold text-gray-600 mb-6">
              Equipo de alta precisión ideal para prácticas de topografía de 6to semestre. Incluye trípode, prisma y bastón. Calibración vigente hasta 2027.
            </p>

            <div className="border-t-4 border-ranti-ink pt-6 flex items-center justify-between">
              {/* Señales de confianza del Oferente (UC-17) */}
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-green-200 rounded-full border-4 border-ranti-ink flex items-center justify-center">
                  <User size={28} className="text-ranti-ink" />
                </div>
                <div>
                  <p className="font-display font-bold text-lg leading-none mb-1">Carlos Mendoza</p>
                  <p className="text-sm font-bold text-gray-500">Estudiante Verificado • 4.8 ⭐</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Cotizador y Fechas (Sticky) */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid sticky top-6">
            
            <h3 className="font-display font-bold text-3xl text-ranti-ink mb-2">
              S/ 25.00 <span className="text-lg text-gray-500">/día</span>
            </h3>
            
            <div className="bg-gray-50 p-4 rounded-2xl border-4 border-ranti-ink mb-6 flex items-start gap-3">
              <ShieldCheck size={24} className="text-ranti-secondary flex-shrink-0" />
              <p className="text-sm font-bold text-gray-600">
                Garantía requerida de S/ 150.00. Se retendrá en tu tarjeta y se liberará al devolver el equipo.
              </p>
            </div>

            {/* Selectores de Fecha (UC-06 Bloqueo de Disponibilidad) */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Fecha de Retiro</label>
                <div className="flex items-center bg-white border-4 border-ranti-ink rounded-xl px-4 py-3 focus-within:shadow-solid-sm transition-all">
                  <Calendar size={20} className="text-gray-400 mr-2" />
                  <input type="date" className="w-full outline-none font-body font-bold text-ranti-ink bg-transparent" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Fecha de Devolución</label>
                <div className="flex items-center bg-white border-4 border-ranti-ink rounded-xl px-4 py-3 focus-within:shadow-solid-sm transition-all">
                  <Calendar size={20} className="text-gray-400 mr-2" />
                  <input type="date" className="w-full outline-none font-body font-bold text-ranti-ink bg-transparent" />
                </div>
              </div>
            </div>

            {/* Desglose de Precios */}
            <div className="border-t-4 border-ranti-ink pt-4 mb-6 space-y-2 font-bold text-sm text-gray-600">
              <div className="flex justify-between">
                <span>S/ 25.00 x 3 días</span>
                <span>S/ 75.00</span>
              </div>
              <div className="flex justify-between">
                <span>Comisión de Servicio (5%)</span>
                <span>S/ 3.75</span>
              </div>
              <div className="flex justify-between pt-2 border-t-2 border-gray-200 text-lg text-ranti-ink font-display">
                <span>Total a Pagar</span>
                <span>S/ 78.75</span>
              </div>
            </div>

            {/* Botón Solicitar */}
            <Link to={`/checkout/${id}`} className="block text-center bg-yellow-300 text-ranti-ink px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl shadow-solid hover:-translate-y-1 hover:shadow-solid-hover active:translate-y-1 active:shadow-none transition-all">
              Solicitar Reserva
            </Link>

            <p className="text-xs font-bold text-gray-400 text-center mt-4 flex items-center justify-center gap-1">
              <AlertCircle size={14}/> No se te cobrará aún.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}