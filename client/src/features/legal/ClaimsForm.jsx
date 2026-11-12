import { AlertTriangle, UploadCloud, UserX, PackageX, Send, ShieldAlert, CheckCircle2, FileText, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export default function ClaimsForm() {
  const [claimType, setClaimType] = useState('incidence'); // 'incidence' o 'user'
  const [operationId, setOperationId] = useState('');
  const [reason, setReason] = useState('Equipo dañado o defectuoso');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef(null);

  const handleFilesChange = (e) => {
    if (e.target.files) {
      const selected = Array.from(e.target.files);
      setFiles((prev) => [...prev, ...selected].slice(0, 5));
    }
  };

  const removeFile = (index) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="py-6 max-w-4xl mx-auto px-4">
      <Link to="/" className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 px-4 py-2 rounded-full transition-all">
        ← Volver al inicio
      </Link>

      {submitted ? (
        <div className="bg-white p-8 md:p-12 rounded-3xl border-4 border-ranti-ink shadow-solid text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 text-green-700 rounded-full border-4 border-ranti-ink flex items-center justify-center mx-auto">
            <CheckCircle2 size={36} />
          </div>
          <h2 className="text-3xl font-display font-bold text-ranti-ink">Reclamo Registrado Exitosamente</h2>
          <p className="font-body font-bold text-gray-600 max-w-lg mx-auto">
            Tu reporte sobre <strong>{claimType === 'incidence' ? 'Incidencia con Equipo' : 'Conducta de Usuario'}</strong> ha sido ingresado para evaluación por el equipo de moderación y soporte.
          </p>
          {claimType === 'incidence' && (
            <div className="bg-yellow-50 p-4 rounded-xl border-2 border-ranti-ink text-left max-w-lg mx-auto text-sm font-body font-semibold">
              <p className="font-bold text-ranti-ink mb-1">Nota sobre tratos activos:</p>
              <p className="text-gray-600">Si este reporte corresponde a una transacción en curso, recuerda que puedes gestionar el bloqueo de garantía y seguimiento directo desde <Link to="/operaciones" className="underline font-bold text-ranti-ink">Mis Operaciones</Link>.</p>
            </div>
          )}
          <div className="pt-4 flex flex-wrap justify-center gap-4">
            <Link to="/" className="inline-block bg-ranti-ink text-white px-8 py-3 rounded-xl border-4 border-ranti-ink font-bold hover:bg-gray-800 transition-all">
              Volver al inicio
            </Link>
            <Link to="/operaciones" className="inline-block bg-yellow-300 text-ranti-ink px-8 py-3 rounded-xl border-4 border-ranti-ink font-bold hover:bg-yellow-400 transition-all">
              Ir a Mis Operaciones
            </Link>
          </div>
        </div>
      ) : (
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
                  onClick={() => {
                    setClaimType('incidence');
                    setReason('Equipo dañado o defectuoso');
                  }}
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
                  onClick={() => {
                    setClaimType('user');
                    setReason('Intento de fraude o estafa');
                  }}
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
                  <label htmlFor="claim-target-id" className="block font-bold text-sm text-ranti-ink mb-2">ID de Operación o Usuario (Opcional)</label>
                  <input 
                    id="claim-target-id"
                    type="text" 
                    value={operationId}
                    onChange={(e) => setOperationId(e.target.value)}
                    placeholder="Ej. #OP-9982 o Maria Gomez" 
                    className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" 
                  />
                </div>
                <div>
                  <label htmlFor="claim-reason" className="block font-bold text-sm text-ranti-ink mb-2">Motivo Principal</label>
                  <select 
                    id="claim-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all cursor-pointer"
                  >
                    {claimType === 'incidence' ? (
                      <>
                        <option value="Equipo dañado o defectuoso">Equipo dañado o defectuoso</option>
                        <option value="Retraso en la entrega / devolución">Retraso en la entrega / devolución</option>
                        <option value="El equipo no coincide con la descripción">El equipo no coincide con la descripción</option>
                      </>
                    ) : (
                      <>
                        <option value="Intento de fraude o estafa">Intento de fraude o estafa</option>
                        <option value="Falta de respeto o acoso">Falta de respeto o acoso</option>
                        <option value="Uso de identidad falsa">Uso de identidad falsa</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="claim-description" className="block font-bold text-sm text-ranti-ink mb-2">Descripción de los hechos</label>
                <textarea 
                  id="claim-description"
                  rows="5" 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe detalladamente qué ocurrió..." 
                  className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all resize-none" 
                  required
                ></textarea>
              </div>
            </div>

            {/* SECCIÓN 3: Evidencias */}
            <div className="space-y-4 pt-6 border-t-4 border-gray-100">
              <h3 className="font-display font-bold text-xl">3. Evidencias (Fotos o Capturas)</h3>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFilesChange}
                multiple 
                accept="image/*,.pdf" 
                className="hidden" 
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-4 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:bg-gray-50 hover:border-ranti-ink transition-all cursor-pointer flex flex-col items-center justify-center gap-2"
              >
                <UploadCloud size={40} className="text-gray-400" />
                <p className="font-bold text-ranti-ink">Haz clic para adjuntar pruebas fotográficas o documentos</p>
                <p className="text-xs font-bold text-gray-400">Hasta 5 archivos (imágenes o PDF, máx. 5MB cada uno).</p>
              </button>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-100 border-2 border-ranti-ink px-3 py-1.5 rounded-lg text-xs font-bold text-ranti-ink">
                      <FileText size={16} />
                      <span className="truncate max-w-[150px]">{file.name}</span>
                      <button type="button" onClick={() => removeFile(idx)} className="text-red-600 hover:text-red-800">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
      )}
    </div>
  );
}