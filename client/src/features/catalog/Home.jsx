import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingCart, Filter, TrendingUp, Clock, HeartHandshake, AlertCircle } from 'lucide-react';
import { useRef, useState } from 'react';

const mockProducts = [
  { id: 1, title: "Estación Total Topográfica Leica TS06", faculty: "Ing. Civil", modality: "Alquiler", price: "S/ 25.00/día", imageColor: "bg-blue-100", badgeColor: "bg-yellow-300", icon: <Clock size={16} /> },
  { id: 2, title: "Calculadora Gráfica HP Prime G2", faculty: "Ing. de Sistemas", modality: "Venta", price: "S/ 350.00", imageColor: "bg-purple-100", badgeColor: "bg-blue-300", icon: <TrendingUp size={16} /> },
  { id: 3, title: "Tableta Digitalizadora Wacom Intuos Pro", faculty: "Arquitectura", modality: "Alquiler", price: "S/ 15.00/día", imageColor: "bg-pink-100", badgeColor: "bg-yellow-300", icon: <Clock size={16} /> },
  { id: 4, title: "Kit Arduino Mega + 37 Sensores", faculty: "Ing. Electrónica", modality: "Préstamo", price: "Gratis", imageColor: "bg-green-100", badgeColor: "bg-pink-300", icon: <HeartHandshake size={16} /> },
];

export default function Home() {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [activeFilter, setActiveFilter] = useState('Todos');
  
  // Referencia para el Scroll
  const gridRef = useRef(null);
  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Lógica combinada de Filtrado (Buscador + Píldoras)
  const filteredProducts = mockProducts.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          product.faculty.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesModality = activeFilter === 'Todos' ? true : product.modality === activeFilter;
    return matchesSearch && matchesModality;
  });

  return (
    <div className="space-y-10 py-4">
      
      {/* Banner */}
      <section className="bg-ranti-light rounded-3xl border-4 border-ranti-ink p-8 md:p-12 shadow-solid flex flex-col items-center text-center relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-block bg-ranti-dark text-white px-4 py-1.5 rounded-full border-4 border-ranti-ink mb-6 font-display font-bold text-sm shadow-solid-sm">
            Comunidad Santamariana
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight mb-4 text-ranti-ink" style={{ textShadow: '2px 2px 0px #ffffff' }}>
            Tus herramientas académicas, a un clic de distancia
          </h2>
          <p className="text-lg md:text-xl font-body font-bold text-gray-700 mb-8">
            Alquila, compra o pide prestado equipamiento especializado de manera segura dentro de la universidad.
          </p>
          <button onClick={scrollToGrid} className="bg-green-gradient text-ranti-ink px-8 py-3 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover hover:-translate-y-1 active:translate-y-1 active:shadow-solid-sm transition-all font-display font-bold text-lg">
            Explorar Catálogo
          </button>
        </div>
      </section>

      {/* Título y Filtros Interactivos (Referencia para Scroll) */}
      <section ref={gridRef} className="flex flex-col md:flex-row justify-between items-center gap-4 scroll-mt-32">
        <h3 className="text-2xl font-display font-bold">
          {searchQuery ? `Resultados para "${searchQuery}"` : 'Equipos Destacados'}
        </h3>
        
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setActiveFilter('Todos')} className={`flex items-center gap-2 px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm transition-all ${activeFilter === 'Todos' ? 'bg-ranti-ink text-white shadow-solid-sm' : 'bg-white hover:bg-gray-100'}`}>
            <Filter size={16} /> Todos
          </button>
          <button onClick={() => setActiveFilter('Alquiler')} className={`px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm transition-all ${activeFilter === 'Alquiler' ? 'bg-yellow-300 shadow-solid-sm -translate-y-1' : 'bg-white hover:bg-yellow-50'}`}>
            Solo Alquileres
          </button>
          <button onClick={() => setActiveFilter('Préstamo')} className={`px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm transition-all ${activeFilter === 'Préstamo' ? 'bg-pink-300 shadow-solid-sm -translate-y-1' : 'bg-white hover:bg-pink-50'}`}>
            Préstamos Solidarios
          </button>
        </div>
      </section>

      {/* Grid de Productos Filtrados */}
      {filteredProducts.length > 0 ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
          {filteredProducts.map((product) => (
            <Link to={`/producto/${product.id}`} key={product.id} className="bg-white rounded-3xl border-4 border-ranti-ink p-4 shadow-solid hover:-translate-y-2 hover:shadow-solid-hover transition-all duration-300 flex flex-col h-full group block">
              <div className={`aspect-square ${product.imageColor} rounded-2xl border-4 border-ranti-ink mb-4 overflow-hidden relative flex items-center justify-center`}>
                <span className={`absolute top-3 left-3 ${product.badgeColor} text-ranti-ink text-xs font-display font-bold px-3 py-1.5 rounded-full border-4 border-ranti-ink flex items-center gap-1 shadow-solid-sm`}>
                  {product.icon} {product.modality}
                </span>
                <div className="text-6xl font-display font-bold text-ranti-ink opacity-20 group-hover:scale-110 transition-transform duration-300">
                  FOTO
                </div>
              </div>
              
              <div className="flex-grow flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{product.faculty}</p>
                  <h3 className="font-display font-bold text-xl leading-tight mb-3 line-clamp-2 text-ranti-ink">{product.title}</h3>
                </div>
                
                <div className="flex items-end justify-between mt-auto pt-4 border-t-4 border-gray-100">
                  <p className="font-display font-bold text-2xl text-ranti-dark">
                    {product.price.split('/')[0]}
                    {product.price.includes('/') && <span className="text-base text-gray-600">/día</span>}
                  </p>
                  <div className="bg-ranti-secondary p-3 rounded-xl border-4 border-ranti-ink shadow-solid-sm group-hover:bg-ranti-primary transition-all">
                    <ShoppingCart size={22} className="text-white" strokeWidth={2.5} />
                  </div>
                </div>
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