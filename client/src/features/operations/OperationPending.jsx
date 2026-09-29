import { ArrowLeft, Info } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function OperationPending({ title, children }) {
  return (
    <section className="py-10 max-w-2xl mx-auto px-4">
      <div className="bg-white p-8 rounded-3xl border-4 border-ranti-ink shadow-solid space-y-6">
        <div className="flex items-center gap-3">
          <Info size={32} className="text-ranti-secondary shrink-0" aria-hidden="true" />
          <h1 className="text-3xl font-display font-bold text-ranti-ink">{title}</h1>
        </div>
        <div role="status" className="bg-yellow-100 border-2 border-yellow-300 rounded-xl p-5 space-y-3 font-body font-semibold text-ranti-ink">
          {children}
        </div>
        <Link to="/" className="inline-flex items-center gap-2 bg-ranti-ink text-white px-6 py-3 rounded-xl border-4 border-ranti-ink font-bold hover:bg-ranti-secondary focus-visible:outline-4 focus-visible:outline-offset-4">
          <ArrowLeft size={20} aria-hidden="true" /> Volver al catálogo
        </Link>
      </div>
    </section>
  );
}
