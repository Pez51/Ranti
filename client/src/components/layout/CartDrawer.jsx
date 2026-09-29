import { X, ShoppingBag } from 'lucide-react';

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
          </h2>
          <button onClick={onClose} className="p-1 bg-gray-100 hover:bg-yellow-300 rounded-full border-4 border-transparent hover:border-ranti-ink hover:shadow-solid-sm transition-all active:translate-y-1 active:shadow-none">
            <X size={24} className="text-ranti-ink" strokeWidth={3} />
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-4 space-y-4">
          <div className="text-center py-12 text-gray-500">
            <ShoppingBag size={48} className="mx-auto mb-4 text-gray-300" />
            <p className="font-bold">El resumen de solicitudes aún no está disponible.</p>
          </div>
        </div>
      </div>
    </>
  );
}
