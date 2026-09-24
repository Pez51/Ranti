import { Package, TrendingUp, Star, AlertTriangle, FileText, Settings } from 'lucide-react';

export default function OferenteDashboard() {
  return (
    <div className="space-y-8 py-4">
      
      {/* Cabecera del Dashboard */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-ranti-ink mb-1">Mi Panel de Oferente</h2>
          <p className="font-body font-semibold text-gray-500">Gestiona tus publicaciones, historial y calificaciones.</p>
        </div>
        <button className="bg-ranti-ink text-white px-6 py-3 rounded-full border-4 border-ranti-ink shadow-solid hover:-translate-y-1 hover:shadow-solid-hover active:translate-y-1 active:shadow-none transition-all font-display font-bold flex items-center gap-2">
          <Package size={20} />
          Publicar Nuevo Bien
        </button>
      </div>

      {/* Tarjetas de Métricas (KPIs) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Tarjeta 1: Operaciones */}
        <div className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center gap-4">
          <div className="p-4 bg-yellow-300 rounded-2xl border-4 border-ranti-ink">
            <TrendingUp size={28} strokeWidth={2.5} className="text-ranti-ink" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Operaciones Cerradas</p>
            <p className="text-3xl font-display font-bold text-ranti-ink">12</p>
          </div>
        </div>

        {/* Tarjeta 2: Reputación */}
        <div className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center gap-4">
          <div className="p-4 bg-pink-300 rounded-2xl border-4 border-ranti-ink">
            <Star size={28} strokeWidth={2.5} className="text-ranti-ink" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-wider">Reputación Global</p>
            <p className="text-3xl font-display font-bold text-ranti-ink flex items-baseline gap-1">
              4.8 <span className="text-base text-gray-400">/ 5.0</span>
            </p>
          </div>
        </div>

        {/* Tarjeta 3: Ganancias / Alertas */}
        <div className="bg-ranti-secondary p-6 rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center gap-4 text-white">
          <div className="p-4 bg-white rounded-2xl border-4 border-ranti-ink">
            <AlertTriangle size={28} strokeWidth={2.5} className="text-ranti-ink" />
          </div>
          <div>
            <p className="text-sm font-bold text-white opacity-90 uppercase tracking-wider">Acción Requerida</p>
            <p className="text-xl font-display font-bold leading-tight">1 Devolución pendiente</p>
          </div>
        </div>
      </div>

      {/* Historial de Operaciones (Tabla Neo-brutalista) */}
      <div className="bg-white rounded-3xl border-4 border-ranti-ink shadow-solid overflow-hidden">
        <div className="p-6 border-b-4 border-ranti-ink bg-gray-50 flex justify-between items-center">
          <h3 className="text-2xl font-display font-bold text-ranti-ink flex items-center gap-2">
            <FileText size={24} /> Historial de Operaciones
          </h3>
          <button className="p-2 bg-white border-2 border-ranti-ink rounded-lg hover:bg-gray-100 transition-colors">
            <Settings size={20} className="text-ranti-ink" />
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body font-semibold">
            <thead className="bg-ranti-light border-b-4 border-ranti-ink text-ranti-ink font-display text-sm uppercase">
              <tr>
                <th className="p-4 border-r-4 border-ranti-ink">ID / Equipo</th>
                <th className="p-4 border-r-4 border-ranti-ink">Modalidad</th>
                <th className="p-4 border-r-4 border-ranti-ink">Demandante</th>
                <th className="p-4 border-r-4 border-ranti-ink">Estado</th>
                <th className="p-4">Acción</th>
              </tr>
            </thead>
            <tbody>
              {/* Fila 1: Operación Activa */}
              <tr className="border-b-4 border-ranti-ink hover:bg-gray-50 transition-colors">
                <td className="p-4 border-r-4 border-ranti-ink">
                  <span className="block font-bold text-xs text-gray-500 mb-1">#OP-9982</span>
                  Estación Total Leica TS06
                </td>
                <td className="p-4 border-r-4 border-ranti-ink">
                  <span className="bg-yellow-300 text-ranti-ink text-xs font-bold px-2 py-1 rounded-md border-2 border-ranti-ink">Alquiler</span>
                </td>
                <td className="p-4 border-r-4 border-ranti-ink flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-full border-2 border-ranti-ink overflow-hidden">
                    <img src="https://placehold.co/100x100" alt="Avatar" />
                  </div>
                  María Gómez
                </td>
                <td className="p-4 border-r-4 border-ranti-ink">
                  <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-md border-2 border-blue-800">Activa / En uso</span>
                </td>
                <td className="p-4">
                  <button className="text-xs font-bold bg-ranti-ink text-white px-4 py-2 rounded-lg border-2 border-ranti-ink hover:bg-gray-800 transition-colors w-full">
                    Registrar Devolución
                  </button>
                </td>
              </tr>

              {/* Fila 2: Operación Cerrada */}
              <tr className="border-b-4 border-ranti-ink hover:bg-gray-50 transition-colors bg-gray-50">
                <td className="p-4 border-r-4 border-ranti-ink">
                  <span className="block font-bold text-xs text-gray-500 mb-1">#OP-9844</span>
                  Calculadora HP Prime G2
                </td>
                <td className="p-4 border-r-4 border-ranti-ink">
                  <span className="bg-blue-300 text-ranti-ink text-xs font-bold px-2 py-1 rounded-md border-2 border-ranti-ink">Venta</span>
                </td>
                <td className="p-4 border-r-4 border-ranti-ink flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-full border-2 border-ranti-ink overflow-hidden">
                    <img src="https://placehold.co/100x100" alt="Avatar" />
                  </div>
                  Carlos Ruiz
                </td>
                <td className="p-4 border-r-4 border-ranti-ink">
                  <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded-md border-2 border-green-800">Cerrada</span>
                </td>
                <td className="p-4">
                  <button className="text-xs font-bold bg-white text-ranti-ink px-4 py-2 rounded-lg border-2 border-ranti-ink hover:bg-gray-100 transition-colors w-full">
                    Ver Detalle
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}