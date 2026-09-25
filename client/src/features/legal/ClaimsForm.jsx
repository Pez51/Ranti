import { AlertTriangle, UploadCloud, UserX, PackageX, Send, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function ClaimsForm() {
  const [claimType, setClaimType] = useState('incidence'); // 'incidence' o 'user'
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Reclamo registrado exitosamente. Un administrador revisará tu caso en breve.');
    navigate('/');
  };

  return (
    <div className="py-6 max-w-4xl mx-auto px-4">
      <Link to="/" className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 px-4 py-2 rounded-full transition-all">
        ← Volver al inicio
      </Link>

      <div className="bg-white p-8 md:p-12 rounded-3xl border-4 border-ranti-ink shadow-solid">
        <div className="mb-8 border-b-4 border-ranti-ink pb-6 flex items-center gap-4">
          <div className="p-4 bg-red-100 rounded-2xl border-4 border-ranti-ink flex-shrink-0">
            <AlertTriangle size={32} className="text-red-600" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-ranti-ink mb-1">Libro de Reclamaciones</h2>
            <p className="font-body font-bold text-gray-500">Reporta una incidencia con un equipo o la mala conducta de un usuario.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* SECCIÓN 1: Tipo de Reclamo */}
          <div className="space-y-4">
            <h3 className="font-display font-bold text-xl">1. ¿Qué deseas reportar?</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setClaimType('incidence')}
                className={`p-6 rounded-2xl border-4 border-ranti-ink font-bold transition-all flex flex-col items-center gap-2 ${
                  claimType === 'incidence' ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <PackageX size={32} />
                <span>Problema con un Equipo (Incidencia)</span>
                <span className="text-xs font-normal text-center mt-1 text-gray-700">Daños, retrasos o equipo no entregado. Retiene la garantía.</span>
              </button>

              <button
                type="button"
                onClick={() => setClaimType('user')}
                className={`p-6 rounded-2xl border-4 border-ranti-ink font-bold transition-all flex flex-col items-center gap-2 ${
                  claimType === 'user' ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <UserX size={32} />
                <span>Conducta de un Usuario (Reporte)</span>
                <span className="text-xs font-normal text-center mt-1 text-gray-700">Acoso, fraude o suplantación de identidad.</span>
              </button>
            </div>
          </div>

          {/* SECCIÓN 2: Detalles */}
          <div className="space-y-4 pt-6 border-t-4 border-gray-100">
            <h3 className="font-display font-bold text-xl">2. Detalles del Reclamo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">ID de Operación o Usuario (Opcional)</label>
                <input type="text" placeholder="Ej. #OP-9982 o Maria Gomez" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" />
              </div>
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Motivo Principal</label>
                <select className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all cursor-pointer">
                  {claimType === 'incidence' ? (
                    <>
                      <option>Equipo dañado o defectuoso</option>
                      <option>Retraso en la entrega / devolución</option>
                      <option>El equipo no coincide con la descripción</option>
                    </>
                  ) : (
                    <>
                      <option>Intento de fraude o estafa</option>
                      <option>Falta de respeto o acoso</option>
                      <option>Uso de identidad falsa</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-sm text-ranti-ink mb-2">Descripción de los hechos</label>
              <textarea rows="5" placeholder="Describe detalladamente qué ocurrió..." className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all resize-none" required></textarea>
            </div>
          </div>

          {/* SECCIÓN 3: Evidencias */}
          <div className="space-y-4 pt-6 border-t-4 border-gray-100">
            <h3 className="font-display font-bold text-xl">3. Evidencias (Fotos o Capturas)</h3>
            <div className="border-4 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:bg-gray-50 hover:border-ranti-ink transition-all cursor-pointer flex flex-col items-center justify-center gap-2">
              <UploadCloud size={40} className="text-gray-400" />
              <p className="font-bold text-ranti-ink">Haz clic para adjuntar pruebas fotográficas</p>
              <p className="text-xs font-bold text-gray-400">Si es un daño, muestra el equipo. Si es acoso, adjunta capturas de pantalla.</p>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row justify-end gap-4 items-center">
            <p className="text-xs font-bold text-gray-500 flex items-center gap-1">
              <ShieldAlert size={14}/> Los reportes falsos conllevan sanciones.
            </p>
            <button type="submit" className="w-full sm:w-auto bg-ranti-ink text-white px-8 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all flex justify-center items-center gap-2">
              <Send size={20}/> Enviar Reclamo
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}