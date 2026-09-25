import { ShieldCheck, UserCheck, FileKey, XCircle, FileSignature } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function ArcoForm() {
  const [arcoType, setArcoType] = useState('Acceso');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Solicitud ARCO ingresada. El plazo de respuesta legal es de 10 a 20 días hábiles según el tipo de solicitud.');
    navigate('/');
  };

  return (
    <div className="py-6 max-w-4xl mx-auto px-4">
      <Link to="/" className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 px-4 py-2 rounded-full transition-all">
        ← Volver al inicio
      </Link>

      <div className="bg-white p-8 md:p-12 rounded-3xl border-4 border-ranti-ink shadow-solid">
        <div className="mb-8 border-b-4 border-ranti-ink pb-6 flex items-center gap-4">
          <div className="p-4 bg-blue-100 rounded-2xl border-4 border-ranti-ink flex-shrink-0">
            <ShieldCheck size={32} className="text-blue-600" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-ranti-ink mb-1">Derechos ARCO</h2>
            <p className="font-body font-bold text-gray-500">Ejerce tus derechos sobre tus datos personales conforme a la Ley N.º 29733.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="space-y-4">
            <h3 className="font-display font-bold text-xl">1. ¿Qué derecho deseas ejercer?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { type: 'Acceso', icon: <UserCheck size={24}/>, desc: 'Solicitar copia de mis datos' },
                { type: 'Rectificación', icon: <FileSignature size={24}/>, desc: 'Corregir datos inexactos' },
                { type: 'Cancelación', icon: <XCircle size={24}/>, desc: 'Eliminar mis datos de Ranti' },
                { type: 'Oposición', icon: <FileKey size={24}/>, desc: 'Oponerme a un uso específico' },
              ].map((item) => (
                <button
                  type="button"
                  key={item.type}
                  onClick={() => setArcoType(item.type)}
                  className={`p-4 rounded-2xl border-4 border-ranti-ink font-bold transition-all flex flex-col items-center text-center gap-2 ${
                    arcoType === item.type ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                >
                  {item.icon}
                  <span className="text-lg">{item.type}</span>
                  <span className="text-xs font-normal text-gray-700">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t-4 border-gray-100">
            <h3 className="font-display font-bold text-xl">2. Detalle de la Solicitud</h3>
            
            <div>
              <label className="block font-bold text-sm text-ranti-ink mb-2">Fundamento de tu petición</label>
              <textarea 
                rows="4" 
                placeholder={`Detalla aquí por qué solicitas la ${arcoType.toLowerCase()} de tus datos...`} 
                className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-bold focus:shadow-solid-sm transition-all resize-none" 
                required
              ></textarea>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t-4 border-gray-100 bg-ranti-light p-6 rounded-2xl border-4 border-ranti-ink">
            <h3 className="font-display font-bold text-xl">3. Verificación de Identidad</h3>
            <p className="text-sm font-bold text-gray-600 mb-4">
              Por ley, debemos verificar que eres el titular de los datos. Adjunta una copia de tu DNI o Carnet Universitario.
            </p>
            <input type="file" className="block w-full text-sm font-bold file:mr-4 file:py-3 file:px-4 file:rounded-full file:border-4 file:border-ranti-ink file:text-sm file:font-bold file:bg-white file:text-ranti-ink hover:file:bg-gray-100 cursor-pointer" required />
          </div>

          <div className="pt-4 flex justify-end">
            <button type="submit" className="w-full sm:w-auto bg-ranti-ink text-white px-8 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all">
              Ingresar Solicitud ARCO
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}