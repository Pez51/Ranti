import { ShieldCheck, Camera, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

export default function EntregaOTP() {
  const { id } = useParams();
  // Estado temporal para simular si somos el Demandante (quien recibe) o el Oferente (quien entrega)
  const [viewAs, setViewAs] = useState('demandante'); 
  const [otpInput, setOtpInput] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  const handleConfirmDelivery = () => {
    if (otpInput === '849201') {
      setIsConfirmed(true);
    } else {
      alert('Código incorrecto. Verifica con el demandante.');
    }
  };

  return (
    <div className="py-6 max-w-3xl mx-auto">
      
      {/* TOGGLE TEMPORAL PARA DESARROLLO */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-200 p-1 rounded-full border-4 border-ranti-ink flex font-bold text-sm">
          <button onClick={() => setViewAs('demandante')} className={`px-4 py-2 rounded-full transition-all ${viewAs === 'demandante' ? 'bg-white shadow-solid-sm border-2 border-ranti-ink' : 'text-gray-500'}`}>
            Vista Demandante (Quien recibe)
          </button>
          <button onClick={() => setViewAs('oferente')} className={`px-4 py-2 rounded-full transition-all ${viewAs === 'oferente' ? 'bg-white shadow-solid-sm border-2 border-ranti-ink' : 'text-gray-500'}`}>
            Vista Oferente (Quien entrega)
          </button>
        </div>
      </div>

      <div className="bg-white p-8 md:p-12 rounded-3xl border-4 border-ranti-ink shadow-solid text-center relative overflow-hidden">
        
        {!isConfirmed ? (
          <>
            <h2 className="text-3xl font-display font-bold text-ranti-ink mb-2">Intercambio Seguro en Campus</h2>
            <p className="font-body font-bold text-gray-500 mb-8 max-w-md mx-auto">
              Reúnanse dentro de las instalaciones de la UCSM. Revisen el estado del equipo antes de confirmar el código.
            </p>

            {/* VISTA DEL DEMANDANTE (Genera y muestra el código) */}
            {viewAs === 'demandante' && (
              <div className="space-y-6">
                <div className="bg-yellow-100 p-8 rounded-3xl border-4 border-ranti-ink inline-block">
                  <p className="text-sm font-bold text-yellow-800 uppercase tracking-widest mb-2">Tu código de seguridad</p>
                  <p className="text-6xl font-display font-bold text-ranti-ink tracking-[0.2em]">849201</p>
                </div>
                <p className="font-bold text-ranti-dark flex items-center justify-center gap-2">
                  <ArrowRight size={20}/> Dicta este código al dueño del equipo.
                </p>
                
                <div className="border-t-4 border-gray-100 pt-6 mt-6">
                  <button className="bg-white text-ranti-ink px-6 py-3 rounded-xl border-4 border-ranti-ink shadow-solid-sm hover:-translate-y-1 transition-all font-bold flex items-center justify-center gap-2 mx-auto w-full md:w-auto">
                    <Camera size={20} />
                    Subir fotos del estado inicial (Opcional)
                  </button>
                </div>
              </div>
            )}

            {/* VISTA DEL OFERENTE (Ingresa el código) */}
            {viewAs === 'oferente' && (
              <div className="space-y-6 max-w-sm mx-auto">
                <div className="bg-blue-50 p-6 rounded-3xl border-4 border-ranti-ink">
                  <label className="block text-sm font-bold text-blue-900 uppercase tracking-widest mb-4">Ingresa el código del estudiante</label>
                  <input 
                    type="text" 
                    maxLength="6"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    placeholder="000000" 
                    className="w-full bg-white border-4 border-ranti-ink rounded-xl px-4 py-4 text-center text-4xl font-display font-bold text-ranti-ink tracking-[0.2em] outline-none focus:shadow-solid-sm transition-all"
                  />
                </div>
                
                <button 
                  onClick={handleConfirmDelivery}
                  className="w-full bg-ranti-secondary text-white px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:bg-ranti-primary hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all"
                >
                  Confirmar Entrega
                </button>
              </div>
            )}
          </>
        ) : (
          
          /* PANTALLA DE ÉXITO (Para ambos) */
          <div className="py-8 space-y-6">
            <div className="w-24 h-24 bg-green-200 rounded-full border-4 border-ranti-ink flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={48} className="text-green-700" />
            </div>
            <h2 className="text-4xl font-display font-bold text-ranti-ink">¡Entrega Confirmada!</h2>
            <p className="font-body font-bold text-gray-600 max-w-md mx-auto">
              La operación está oficialmente activa. El contrato y la retención de la garantía han quedado fijados en el sistema.
            </p>
            <Link to="/oferente" className="inline-block bg-ranti-ink text-white px-8 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-lg hover:-translate-y-1 hover:shadow-solid transition-all mt-4">
              Ir a mi Panel de Control
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}