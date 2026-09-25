import { X, ShoppingCart, Lock, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CartDrawer({ isOpen, onClose }) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-ranti-ink bg-opacity-40 z-40 transition-opacity" onClick={onClose} />
      )}

      <div className={`fixed top-0 right-0 h-full w-full max-w-sm md:max-w-md bg-[#FDFBF7] border-l-4 border-ranti-ink z-50 transform transition-transform duration-300 ease-in-out shadow-[-8px_0_0_0_#062912] flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 md:p-6 border-b-4 border-ranti-ink bg-white flex justify-between items-center">
          <h2 className="text-2xl font-display font-bold flex items-center gap-2 text-ranti-ink">
            Mis Solicitudes
            <span className="bg-ranti-primary text-ranti-ink text-sm px-2 py-0.5 rounded-full border-2 border-ranti-ink">1</span>
          </h2>
          <button onClick={onClose} className="p-1 bg-gray-100 hover:bg-yellow-300 rounded-full border-4 border-transparent hover:border-ranti-ink hover:shadow-solid-sm transition-all active:translate-y-1 active:shadow-none">
            <X size={24} className="text-ranti-ink" strokeWidth={3} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          {/* Item en el carrito */}
          <div className="bg-white p-4 rounded-2xl border-4 border-ranti-ink shadow-solid-sm flex gap-4">
            <div className="w-20 h-20 bg-blue-100 rounded-xl border-2 border-ranti-ink flex-shrink-0"></div>
            <div className="flex flex-col justify-between w-full">
              <div>
                <h4 className="font-bold text-sm leading-tight text-ranti-ink">Estación Total Leica TS06</h4>
                <p className="text-xs font-bold text-gray-500 mt-1">Alquiler: 12 al 15 Oct</p>
              </div>
              <div className="flex justify-between items-end mt-2">
                <span className="font-display font-bold text-lg">S/ 78.75</span>
                <span className="text-xs font-bold text-yellow-600 flex items-center gap-1"><Lock size={12}/> +Garantía</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t-4 border-ranti-ink bg-white">
          <div className="flex justify-between items-center mb-4 font-display font-bold text-xl">
            <span>Total a Pagar</span>
            <span>S/ 228.75</span>
          </div>
          <Link to="/checkout/1" onClick={onClose} className="w-full bg-yellow-300 text-ranti-ink px-6 py-4 rounded-xl border-4 border-ranti-ink font-display font-bold text-xl shadow-solid hover:-translate-y-1 hover:shadow-solid-hover active:translate-y-1 active:shadow-none transition-all flex justify-center items-center gap-2">
            Procesar Pago <ArrowRight size={20}/>
          </Link>
        </div>
      </div>
    </>
  );
}