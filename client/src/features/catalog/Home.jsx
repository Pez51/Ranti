import { Link, useSearchParams } from 'react-router-dom';
import { Filter, AlertCircle, PackageSearch } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

const formatPrice = (product) => product.modality === 'Préstamo'
  ? 'Gratis'
  : `S/ ${Number(product.price).toFixed(2)}${product.modality === 'Alquiler' ? '/día' : ''}`;

export default function Home() {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [activeFilter, setActiveFilter] = useState('Todos');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const gridRef = useRef(null);

  // Lógica para ocultar el banner a usuarios logueados o recurrentes
  const [showBanner] = useState(() => {
    if (getSession()) return false; // Ocultar si ya inició sesión
    if (sessionStorage.getItem('ranti_banner_seen')) return false; // Ocultar si ya estaba navegando
    
    sessionStorage.setItem('ranti_banner_seen', 'true'); // Marcar como visto para la próxima vez
    return true;
  });


  
  useEffect(() => {
    const controller = new AbortController();
    const loadProducts = async () => {
      setLoading(true);
      setError('');
      const query = new URLSearchParams();
      if (searchQuery) query.set('search', searchQuery);
      if (activeFilter !== 'Todos') query.set('modality', activeFilter);
      try {
        const suffix = query.size ? `?${query}` : '';
        setProducts(await apiRequest(`/publications${suffix}`, { signal: controller.signal }));
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    loadProducts();
    return () => controller.abort();
  }, [activeFilter, searchQuery]);

  return (
    <div className="space-y-10 py-4">
      {showBanner && (
        <section className="bg-ranti-light rounded-3xl border-4 border-ranti-ink p-8 md:p-12 shadow-solid flex flex-col items-center text-center">
          <div className="max-w-2xl">
            <div className="inline-block bg-ranti-dark text-white px-4 py-1.5 rounded-full border-4 border-ranti-ink mb-6 font-display font-bold text-sm shadow-solid-sm">Comunidad Santamariana</div>
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight mb-4 text-ranti-ink" style={{ textShadow: '2px 2px 0px #ffffff' }}>Tus herramientas académicas, a un clic de distancia</h2>
            <p className="text-lg md:text-xl font-body font-bold text-gray-700 mb-8">Alquila, compra o pide prestado equipamiento especializado dentro de la comunidad universitaria.</p>
            <button onClick={() => gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="bg-green-gradient text-ranti-ink px-8 py-3 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover hover:-translate-y-1 transition-all font-display font-bold text-lg">Explorar Catálogo</button>
          </div>
        </section>
      )}

      <section ref={gridRef} className="flex flex-col md:flex-row justify-between items-center gap-4 scroll-mt-32">
        <h3 className="text-2xl font-display font-bold">{searchQuery ? `Resultados para "${searchQuery}"` : 'Equipos disponibles'}</h3>
        <div className="flex flex-wrap gap-3">
          {['Todos', 'Venta', 'Alquiler', 'Préstamo'].map((filter) => (
            <button key={filter} onClick={() => setActiveFilter(filter)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm transition-all ${activeFilter === filter ? 'bg-ranti-ink text-white shadow-solid-sm' : 'bg-white hover:bg-gray-100'}`}>
              {filter === 'Todos' && <Filter size={16} />} {filter}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="text-center py-20 font-bold text-gray-500">Cargando catálogo…</div>
      ) : error ? (
        <div role="alert" className="text-center py-16 bg-red-50 rounded-3xl border-4 border-red-300">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h3 className="text-2xl font-display font-bold mb-2">No se pudo cargar el catálogo</h3>
          <p className="font-bold text-red-700">{error}</p>
        </div>
      ) : products.length ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
          {products.map((product) => (
            <Link to={`/producto/${product.id}`} key={product.id} className="bg-white rounded-3xl border-4 border-ranti-ink p-4 shadow-solid hover:-translate-y-2 hover:shadow-solid-hover transition-all duration-300 flex flex-col h-full group">
              <div className="aspect-square bg-gray-100 rounded-2xl border-4 border-ranti-ink mb-4 overflow-hidden relative flex items-center justify-center">
                <span className="absolute z-10 top-3 left-3 bg-yellow-300 text-ranti-ink text-xs font-display font-bold px-3 py-1.5 rounded-full border-4 border-ranti-ink shadow-solid-sm">{product.modality}</span>
                {product.primary_image ? (<img src={product.primary_image} alt={product.title} className="w-full h-full object-cover" onError={(e) => { e.target.src = 'https://placehold.co/400x400/eeeeee/999999?text=Sin+Imagen'; }}/>) : (<PackageSearch size={64} className="text-gray-300" />)}
              </div>
              <div className="flex-grow flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{product.category}</p>
                  <h3 className="font-display font-bold text-xl leading-tight mb-3 line-clamp-2 text-ranti-ink">{product.title}</h3>
                </div>
                <p className="font-display font-bold text-2xl text-ranti-dark pt-4 border-t-4 border-gray-100">{formatPrice(product)}</p>
              </div>
            </Link>
          ))}
        </section>
      ) : (
        <div className="text-center py-20 bg-white rounded-3xl border-4 border-dashed border-gray-300">
          <AlertCircle size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-2xl font-display font-bold text-ranti-ink mb-2">No se encontraron equipos</h3>
          <p className="text-gray-500 font-bold">Intenta cambiar los filtros o los términos de búsqueda.</p>
        </div>
      )}
    </div>
  );
}
