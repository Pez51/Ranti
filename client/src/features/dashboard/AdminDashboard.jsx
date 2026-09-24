import { ShieldAlert, Users, FileWarning, CheckCircle, Eye, Activity, AlertOctagon, UserCheck } from 'lucide-react';
import { useState } from 'react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('incidencias');

  return (
    <div className="space-y-8 py-4">
      
      {/* Cabecera del Portal Administrativo */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-purple-100 p-6 rounded-3xl border-4 border-ranti-ink shadow-solid">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-purple-300 rounded-2xl border-4 border-ranti-ink">
            <ShieldAlert size={32} strokeWidth={2.5} className="text-ranti-ink" />
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-ranti-ink mb-1">Portal Administrativo</h2>
            <p className="font-body font-semibold text-gray-700">Moderación, resolución de disputas y auditoría.</p>
          </div>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm shadow-solid-sm flex items-center gap-2">
          <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse border-2 border-ranti-ink"></span>
          Sistema Operativo
        </div>
      </div>

      {/* Tarjetas de Alerta (KPIs de Moderación) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-red-100 p-6 rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-1">Incidencias Críticas</p>
            <p className="text-4xl font-display font-bold text-red-600">4</p>
          </div>
          <FileWarning size={40} strokeWidth={2} className="text-red-500 opacity-50" />
        </div>

        <div className="bg-blue-100 p-6 rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-1">Validaciones Pendientes</p>
            <p className="text-4xl font-display font-bold text-blue-600">12</p>
          </div>
          <UserCheck size={40} strokeWidth={2} className="text-blue-500 opacity-50" />
        </div>

        <div className="bg-gray-100 p-6 rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-600 uppercase tracking-wider mb-1">Eventos Auditados (Hoy)</p>
            <p className="text-4xl font-display font-bold text-gray-800">842</p>
          </div>
          <Activity size={40} strokeWidth={2} className="text-gray-500 opacity-50" />
        </div>
      </div>

      {/* Navegación Interna (Pestañas) */}
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap hide-scrollbar pb-2">
        <button 
          onClick={() => setActiveTab('incidencias')}
          className={`px-6 py-3 rounded-full border-4 border-ranti-ink font-display font-bold transition-all flex items-center gap-2 ${
            activeTab === 'incidencias' ? 'bg-ranti-ink text-white shadow-solid-sm translate-y-[-2px]' : 'bg-white text-ranti-ink hover:bg-gray-50'
          }`}
        >
          <AlertOctagon size={18} /> Incidencias & Disputas
        </button>
        <button 
          onClick={() => setActiveTab('verificaciones')}
          className={`px-6 py-3 rounded-full border-4 border-ranti-ink font-display font-bold transition-all flex items-center gap-2 ${
            activeTab === 'verificaciones' ? 'bg-ranti-ink text-white shadow-solid-sm translate-y-[-2px]' : 'bg-white text-ranti-ink hover:bg-gray-50'
          }`}
        >
          <Users size={18} /> Verificación de Egresados
        </button>
        <button 
          onClick={() => setActiveTab('auditoria')}
          className={`px-6 py-3 rounded-full border-4 border-ranti-ink font-display font-bold transition-all flex items-center gap-2 ${
            activeTab === 'auditoria' ? 'bg-ranti-ink text-white shadow-solid-sm translate-y-[-2px]' : 'bg-white text-ranti-ink hover:bg-gray-50'
          }`}
        >
          <Activity size={18} /> Bitácora (NIST SP 800-92)
        </button>
      </div>

      {/* Contenido Dinámico según la Pestaña */}
      <div className="bg-white rounded-3xl border-4 border-ranti-ink shadow-solid overflow-hidden">
        
        {/* VISTA: INCIDENCIAS */}
        {activeTab === 'incidencias' && (
          <>
            <div className="p-6 border-b-4 border-ranti-ink bg-gray-50 flex justify-between items-center">
              <h3 className="text-2xl font-display font-bold text-ranti-ink">Cola de Resolución de Disputas</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body font-semibold">
                <thead className="bg-ranti-light border-b-4 border-ranti-ink text-ranti-ink font-display text-sm uppercase">
                  <tr>
                    <th className="p-4 border-r-4 border-ranti-ink">Reporte ID</th>
                    <th className="p-4 border-r-4 border-ranti-ink">Motivo / Tipo</th>
                    <th className="p-4 border-r-4 border-ranti-ink">Operación Afectada</th>
                    <th className="p-4 border-r-4 border-ranti-ink">Fondos Retenidos</th>
                    <th className="p-4">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b-4 border-ranti-ink hover:bg-red-50 transition-colors">
                    <td className="p-4 border-r-4 border-ranti-ink">
                      <span className="block font-bold text-xs text-gray-500 mb-1">Hace 2 horas</span>
                      #INC-042
                    </td>
                    <td className="p-4 border-r-4 border-ranti-ink">
                      <span className="bg-red-200 text-red-900 text-xs font-bold px-2 py-1 rounded-md border-2 border-red-900">Daño Reportado</span>
                      <p className="text-sm mt-1">Lente rayado (Cámara Canon)</p>
                    </td>
                    <td className="p-4 border-r-4 border-ranti-ink text-sm">
                      <span className="font-bold">#OP-9982</span> (Alquiler)<br/>
                      Oferente vs Demandante
                    </td>
                    <td className="p-4 border-r-4 border-ranti-ink">
                      <span className="font-display font-bold text-lg text-ranti-ink">S/ 150.00</span>
                      <span className="block text-xs text-gray-500">Garantía Escrow</span>
                    </td>
                    <td className="p-4">
                      <button className="text-xs font-bold bg-ranti-ink text-white px-4 py-2 rounded-lg border-2 border-ranti-ink hover:bg-gray-800 transition-colors w-full flex justify-center items-center gap-2">
                        <Eye size={16}/> Revisar Evidencia
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* VISTA: VERIFICACIONES */}
        {activeTab === 'verificaciones' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <UserCheck size={64} className="text-blue-300 mb-4" />
            <h3 className="text-2xl font-display font-bold text-ranti-ink mb-2">Validación Documental</h3>
            <p className="text-gray-500 font-bold max-w-md">
              Revisión manual requerida para usuarios egresados que no disponen de correo institucional (@ucsm.edu.pe).
            </p>
            {/* Aquí iría la tabla de verificaciones */}
          </div>
        )}

        {/* VISTA: AUDITORÍA */}
        {activeTab === 'auditoria' && (
          <div className="p-10 text-center flex flex-col items-center justify-center">
            <Activity size={64} className="text-gray-300 mb-4" />
            <h3 className="text-2xl font-display font-bold text-ranti-ink mb-2">Bitácora Inmutable</h3>
            <p className="text-gray-500 font-bold max-w-md">
              Registro de eventos estructurados y no repudiables conforme a la norma NIST SP 800-92 y Ley N.º 29733.
            </p>
            {/* Aquí iría la tabla de logs de solo lectura */}
          </div>
        )}

      </div>
    </div>
  );
}