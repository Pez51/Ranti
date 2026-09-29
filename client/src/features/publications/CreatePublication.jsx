import { UploadCloud, Tag, FileText, CheckCircle, Info } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

export default function CreatePublication() {
  const [modality, setModality] = useState('Alquiler');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = getSession()?.token;
    if (!token) {
      setError('Inicia sesión para crear una publicación.');
      return;
    }

    const form = new FormData(e.currentTarget);
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await apiRequest('/publications', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: form.get('title'),
          category: form.get('category'),
          condition: form.get('condition'),
          description: form.get('description'),
          modality,
          price: modality === 'Préstamo' ? 0 : Number(form.get('price')),
          guarantee_amount: modality === 'Alquiler' ? Number(form.get('guarantee_amount')) : 0,
          images: [],
        }),
      });
      setSuccess('La publicación fue creada correctamente.');
      e.currentTarget.reset();
      setModality('Alquiler');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
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
              <input name="title" type="text" placeholder="Ej. Calculadora Científica HP Prime G2" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Categoría / Facultad</label>
                <select name="category" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all cursor-pointer">
                  <option>Ingeniería Civil</option>
                  <option>Ingeniería de Sistemas</option>
                  <option>Arquitectura</option>
                  <option>Electrónica</option>
                </select>
              </div>
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Estado Físico</label>
                <select name="condition" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all cursor-pointer">
                  <option>Nuevo (Sellado)</option>
                  <option>Como Nuevo (Poco uso)</option>
                  <option>Usado (Buen estado)</option>
                  <option>Con detalles estéticos</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-sm text-ranti-ink mb-2">Descripción detallada</label>
              <textarea name="description" rows="4" placeholder="Especifica qué incluye, si tiene cargador, su tiempo de uso, etc." className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all resize-none" required></textarea>
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
                  <input name="price" type="number" min="0.01" step="0.01" placeholder="0.00" className="w-full bg-white border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" required />
                </div>
                
                {modality === 'Alquiler' && (
                  <div>
                    <label className="block font-bold text-sm text-ranti-ink mb-2 flex items-center gap-1">
                      Garantía propuesta (S/)
                      <span title="El cobro y la custodia de la garantía aún no están implementados." className="cursor-help"><Info size={14} className="text-ranti-secondary"/></span>
                    </label>
                    <input name="guarantee_amount" type="number" min="0" step="0.01" placeholder="Ej. 150.00" className="w-full bg-white border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all" required />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SECCIÓN 4: Fotografías */}
          <div className="space-y-4 pt-6 border-t-4 border-gray-100">
            <h3 className="font-display font-bold text-xl flex items-center gap-2"><UploadCloud size={20}/> 4. Fotografías (Máx. 4)</h3>
            
            <div className="border-4 border-dashed border-gray-300 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2">
              <UploadCloud size={40} className="text-gray-400" />
              <p className="font-bold text-ranti-ink">Carga de fotografías aún no disponible</p>
              <p className="text-xs font-bold text-gray-400">La publicación se guardará sin imágenes.</p>
            </div>
          </div>

          {error && <p role="alert" className="bg-red-50 border-2 border-red-300 rounded-xl p-3 font-bold text-red-700">{error}</p>}
          {success && <p role="status" className="bg-green-50 border-2 border-green-300 rounded-xl p-3 font-bold text-green-800">{success} <Link to="/oferente" className="underline">Volver al panel</Link></p>}

          {/* Acciones */}
          <div className="pt-8 flex justify-end gap-4">
            <button type="button" disabled title="Los borradores aún no están implementados" className="px-6 py-4 rounded-xl border-4 border-gray-300 text-gray-400 font-bold cursor-not-allowed">
              Borradores próximamente
            </button>
            <button type="submit" disabled={loading} className="bg-ranti-ink text-white px-8 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait">
              <CheckCircle size={20}/> {loading ? 'Publicando…' : 'Publicar Bien'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
