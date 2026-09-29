import { ShieldCheck, User, AlertCircle, PackageSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const loadProduct = async () => {
      try {
        setProduct(await apiRequest(`/publications/${id}`, { signal: controller.signal }));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadProduct();
    return () => controller.abort();
  }, [id]);

  if (loading) return <p className="py-20 text-center font-bold text-gray-500">Cargando publicación…</p>;
  if (error || !product) return (
    <div role="alert" className="my-12 text-center py-16 bg-red-50 rounded-3xl border-4 border-red-300">
      <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
      <h2 className="text-2xl font-display font-bold">No se pudo cargar la publicación</h2>
      <p className="font-bold text-red-700 mt-2">{error}</p>
      <Link to="/" className="inline-block mt-6 underline font-bold">Volver al catálogo</Link>
    </div>
  );

  const primaryImage = product.images?.find((image) => image.is_primary)?.image_url || product.images?.[0]?.image_url;
  const price = product.modality === 'Préstamo' ? 'Gratis' : `S/ ${Number(product.price).toFixed(2)}`;

  return (
    <div className="py-6 max-w-6xl mx-auto">
      <Link to="/" className="inline-block mb-6 text-ranti-ink font-bold hover:underline underline-offset-4 px-4 py-2">← Volver al catálogo</Link>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-gray-100 aspect-video rounded-3xl border-4 border-ranti-ink shadow-solid flex items-center justify-center relative overflow-hidden">
            <span className="absolute z-10 top-4 left-4 bg-yellow-300 text-ranti-ink text-sm font-display font-bold px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid-sm">{product.modality}</span>
            {primaryImage ? <img src={primaryImage} alt={product.title} className="w-full h-full object-cover" /> : <PackageSearch size={80} className="text-gray-300" />}
          </div>
          <div className="bg-white p-8 rounded-3xl border-4 border-ranti-ink shadow-solid">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-ranti-light text-ranti-dark font-bold text-xs px-3 py-1 rounded-full border-2 border-ranti-ink uppercase">{product.category}</span>
              <span className="text-gray-500 font-bold text-sm">{product.condition}</span>
            </div>
            <h1 className="text-4xl font-display font-bold text-ranti-ink mb-4 leading-tight">{product.title}</h1>
            <p className="text-lg font-body font-semibold text-gray-600 mb-6 whitespace-pre-wrap">{product.description}</p>
            <div className="border-t-4 border-ranti-ink pt-6 flex items-center gap-4">
              <div className="w-14 h-14 bg-green-200 rounded-full border-4 border-ranti-ink flex items-center justify-center"><User size={28} /></div>
              <div>
                <p className="font-display font-bold text-lg">Oferente UCSM</p>
                <p className="text-sm font-bold text-gray-500">Reputación: {Number(product.owner_reputation_score).toFixed(1)} / 5</p>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl border-4 border-ranti-ink shadow-solid sticky top-32">
            <h3 className="font-display font-bold text-3xl text-ranti-ink mb-4">{price}{product.modality === 'Alquiler' && <span className="text-lg text-gray-500"> /día</span>}</h3>
            {Number(product.guarantee_amount) > 0 && (
              <div className="bg-gray-50 p-4 rounded-2xl border-4 border-ranti-ink mb-6 flex items-start gap-3">
                <ShieldCheck size={24} className="text-ranti-secondary flex-shrink-0" />
                <p className="text-sm font-bold text-gray-600">Garantía propuesta: S/ {Number(product.guarantee_amount).toFixed(2)}. El cobro y la custodia aún no están habilitados.</p>
              </div>
            )}
            <button type="button" disabled className="w-full bg-gray-200 text-gray-500 px-6 py-4 rounded-xl border-4 border-gray-400 font-display font-bold text-xl cursor-not-allowed">Solicitudes próximamente</button>
            <p className="text-xs font-bold text-gray-400 text-center mt-4 flex items-center justify-center gap-1"><AlertCircle size={14}/> No se realizará ningún cobro.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
