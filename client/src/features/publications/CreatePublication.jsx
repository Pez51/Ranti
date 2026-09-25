import { UploadCloud, Tag, FileText, CheckCircle, Info } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function CreatePublication() {
  const [modality, setModality] = useState('Alquiler');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Publicación creada con éxito. Pasando a estado: Activa');
    navigate('/oferente');
  };

  return (
    <div className="py-6 max-w-4xl mx-auto">
      <Link to="/oferente" className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 px-4 py-2 rounded-full transition-all">
        ← Volver a Mi Panel
      </Link>

      <div className="bg-white p-8 md:p-12 rounded-3xl border-4 border-ranti-ink shadow-solid">
        <div className="mb-8 border-b-4 border-ranti-ink pb-6">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-ranti-ink mb-2">Publicar un Equipo</h2>
          <p className="font-body font-bold text-gray-500">Completa los detalles para que otros estudiantes puedan encontrar tu instrumental.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          {/* SECCIÓN 1: Modalidad */}
          <div className="space-y-4">
            <h3 className="font-display font-bold text-xl flex items-center gap-2"><Tag size={20}/> 1. Modalidad de Oferta</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['Venta', 'Alquiler', 'Préstamo'].map((mod) => (
                <button
                  type="button"
                  key={mod}
                  onClick={() => setModality(mod)}
                  className={`p-4 rounded-xl border-4 border-ranti-ink font-bold transition-all ${
                    modality === mod ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {mod}
                  {mod === 'Préstamo' && <span className="block text-xs font-normal mt-1 text-pink-600">Gratuito / Solidario</span>}
                </button>
              ))}
            </div>
          </div>

          {/* SECCIÓN 2: Información Básica */}
          <div className="space-y-4 pt-6 border-t-4 border-gray-100">
            <h3 className="font-display font-bold text-xl flex items-center gap-2"><FileText size={20}/> 2. Detalles del Equipo</h3>
            
            <div>
              <label className="block font-bold text-sm text-ranti-ink mb-2">Título de la publicación</label>
              <input type="text" placeholder="Ej. Calculadora Científica HP Prime G2" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Categoría / Facultad</label>
                <select className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all cursor-pointer">
                  <option>Ingeniería Civil</option>
                  <option>Ingeniería de Sistemas</option>
                  <option>Arquitectura</option>
                  <option>Electrónica</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Estado Físico</label>
                <select className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all cursor-pointer">
                  <option>Nuevo (Sellado)</option>
                  <option>Como Nuevo (Poco uso)</option>
                  <option>Usado (Buen estado)</option>
                  <option>Con detalles estéticos</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-sm text-ranti-ink mb-2">Descripción detallada</label>
              <textarea rows="4" placeholder="Especifica qué incluye, si tiene cargador, su tiempo de uso, etc." className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all resize-none" required></textarea>
            </div>
          </div>

          {/* SECCIÓN 3: Precios (Dinámica según modalidad) */}
          {modality !== 'Préstamo' && (
            <div className="space-y-4 pt-6 border-t-4 border-gray-100 bg-ranti-light p-6 rounded-2xl border-4 border-ranti-ink">
              <h3 className="font-display font-bold text-xl flex items-center gap-2">3. Precios y Garantías</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-sm text-ranti-ink mb-2">
                    {modality === 'Alquiler' ? 'Precio de Alquiler por Día (S/)' : 'Precio de Venta Fijo (S/)'}
                  </label>
                  <input type="number" min="1" placeholder="0.00" className="w-full bg-white border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" required />
                </div>
                
                {modality === 'Alquiler' && (
                  <div>
                    <label className="block font-bold text-sm text-ranti-ink mb-2 flex items-center gap-1">
                      Monto de Garantía Escrow (S/) 
                      <span title="Este dinero se le retendrá al demandante por seguridad." className="cursor-help"><Info size={14} className="text-ranti-secondary"/></span>
                    </label>
                    <input type="number" min="1" placeholder="Ej. 150.00" className="w-full bg-white border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" required />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECCIÓN 4: Fotografías */}
          <div className="space-y-4 pt-6 border-t-4 border-gray-100">
            <h3 className="font-display font-bold text-xl flex items-center gap-2"><UploadCloud size={20}/> 4. Fotografías (Máx. 4)</h3>
            
            <div className="border-4 border-dashed border-gray-300 rounded-2xl p-8 text-center hover:bg-gray-50 hover:border-ranti-ink transition-all cursor-pointer flex flex-col items-center justify-center gap-2">
              <UploadCloud size={40} className="text-gray-400" />
              <p className="font-bold text-ranti-ink">Haz clic para subir fotos o arrástralas aquí</p>
              <p className="text-xs font-bold text-gray-400">Formatos JPG o PNG. Máximo 5MB por foto.</p>
            </div>
          </div>

          {/* Acciones */}
          <div className="pt-8 flex justify-end gap-4">
            <button type="button" onClick={() => navigate('/oferente')} className="px-6 py-4 rounded-xl border-4 border-ranti-ink font-bold hover:bg-gray-100 transition-all">
              Guardar como Borrador
            </button>
            <button type="submit" className="bg-ranti-ink text-white px-8 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all flex items-center gap-2">
              <CheckCircle size={20}/> Publicar Bien
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}