import { CreditCard, Lock, ShieldCheck, Smartphone, CheckCircle } from 'lucide-react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function Checkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePayment = (e) => {
    e.preventDefault();
    setIsProcessing(true);
    // Simulamos el tiempo de respuesta de CulqiOnline/Niubiz
    setTimeout(() => {
      setIsProcessing(false);
      // Redirigimos a la pantalla de entrega OTP
      navigate(`/entrega/${id}`);
    }, 2000);
  };

  return (
    <div className="py-6 max-w-4xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-display font-bold text-ranti-ink mb-6">Completa tu Reserva</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* COLUMNA IZQUIERDA: Formulario de Pago */}
        <div className="space-y-6">
          {/* Selector de Método de Pago */}
          <div className="flex gap-4">
            <button 
              onClick={() => setPaymentMethod('card')}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-4 border-ranti-ink font-bold transition-all ${
                paymentMethod === 'card' ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <CreditCard size={28} />
              Tarjeta
            </button>
            <button 
              onClick={() => setPaymentMethod('yape')}
              className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-2xl border-4 border-ranti-ink font-bold transition-all ${
                paymentMethod === 'yape' ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-white hover:bg-gray-50'
              }`}
            >
              <Smartphone size={28} />
              Yape / Plin
            </button>
          </div>

          {/* Formulario (Tarjeta) */}
          {paymentMethod === 'card' && (
            <form onSubmit={handlePayment} className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid space-y-4">
              <div>
                <label className="block font-bold text-sm text-ranti-ink mb-2">Número de Tarjeta</label>
                <div className="bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 flex items-center focus-within:shadow-solid-sm transition-all">
                  <CreditCard size={20} className="text-gray-400 mr-2" />
                  <input type="text" placeholder="0000 0000 0000 0000" className="w-full bg-transparent outline-none font-body font-bold text-ranti-ink tracking-widest" required />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-sm text-ranti-ink mb-2">Vencimiento</label>
                  <input type="text" placeholder="MM/AA" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-body font-bold focus:shadow-solid-sm transition-all" required />
                </div>
                <div>
                  <label className="block font-bold text-sm text-ranti-ink mb-2">CVV</label>
                  <input type="password" placeholder="123" maxLength="4" className="w-full bg-gray-50 border-4 border-ranti-ink rounded-xl px-4 py-3 outline-none font-body font-bold focus:shadow-solid-sm transition-all" required />
                </div>
              </div>
              
              <div className="pt-4">
                <button 
                  type="submit" 
                  disabled={isProcessing}
                  className="w-full bg-ranti-ink text-white px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid active:translate-y-1 active:shadow-none transition-all disabled:opacity-70 disabled:transform-none flex justify-center items-center gap-2"
                >
                  {isProcessing ? 'Procesando seguro...' : 'Pagar y Retener Garantía'}
                  {!isProcessing && <Lock size={20} />}
                </button>
              </div>
            </form>
          )}

          {/* Formulario (Yape/Plin) */}
          {paymentMethod === 'yape' && (
            <div className="bg-white p-6 text-center rounded-3xl border-4 border-ranti-ink shadow-solid space-y-4">
              <div className="w-32 h-32 bg-gray-200 mx-auto rounded-xl border-4 border-ranti-ink flex items-center justify-center font-bold text-gray-400">
                QR YAPE
              </div>
              <p className="font-bold text-gray-600">Escanea el código para procesar el pago y la garantía desde tu billetera móvil.</p>
              <button onClick={handlePayment} className="w-full bg-ranti-ink text-white px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl hover:-translate-y-1 hover:shadow-solid transition-all">
                Ya realicé el pago
              </button>
            </div>
          )}
          
          <p className="text-xs font-bold text-gray-500 flex items-center justify-center gap-1">
            <ShieldCheck size={16} className="text-green-600"/> Pago encriptado y asegurado por CulqiOnline.
          </p>
        </div>

        {/* COLUMNA DERECHA: Resumen de la Orden */}
        <div className="bg-ranti-light p-6 rounded-3xl border-4 border-ranti-ink shadow-solid h-fit">
          <h3 className="font-display font-bold text-2xl text-ranti-ink mb-4">Resumen</h3>
          
          <div className="flex gap-4 items-center bg-white p-3 rounded-2xl border-4 border-ranti-ink mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-xl border-2 border-ranti-ink flex-shrink-0"></div>
            <div>
              <p className="font-bold text-sm leading-tight text-ranti-ink">Estación Total Topográfica Leica TS06</p>
              <p className="text-xs font-bold text-gray-500">Del 12 al 15 de Octubre</p>
            </div>
          </div>

          <div className="space-y-3 font-bold text-sm text-gray-600 border-b-4 border-ranti-ink pb-4 mb-4">
            <div className="flex justify-between">
              <span>Alquiler (3 días)</span>
              <span>S/ 75.00</span>
            </div>
            <div className="flex justify-between">
              <span>Comisión de Servicio (5%)</span>
              <span>S/ 3.75</span>
            </div>
            <div className="flex justify-between text-yellow-600">
              <span className="flex items-center gap-1"><Lock size={14}/> Garantía Retenida</span>
              <span>S/ 150.00</span>
            </div>
          </div>

          <div className="flex justify-between items-end">
            <span className="font-display font-bold text-lg">Total a Pagar</span>
            <div className="text-right">
              <span className="block font-display font-bold text-3xl text-ranti-dark">S/ 228.75</span>
              <span className="text-xs text-gray-500 font-bold">S/ 150.00 serán devueltos</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}