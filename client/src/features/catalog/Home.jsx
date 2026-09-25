import { Link } from 'react-router-dom';
import { ShoppingCart, Filter, TrendingUp, Clock, HeartHandshake } from 'lucide-react';

// Datos simulados (Mock Data) basados en los bienes especializados de la UCSM
const mockProducts = [
  {
    id: 1,
    title: "Estación Total Topográfica Leica TS06",
    faculty: "Ing. Civil",
    modality: "Alquiler",
    price: "S/ 25.00/día",
    originalPrice: "S/ 45.00/día",
    imageColor: "bg-blue-100",
    badgeColor: "bg-yellow-300",
    icon: <Clock size={16} />
  },
  {
    id: 2,
    title: "Calculadora Gráfica HP Prime G2",
    faculty: "Ing. de Sistemas",
    modality: "Venta",
    price: "S/ 350.00",
    originalPrice: "S/ 420.00",
    imageColor: "bg-purple-100",
    badgeColor: "bg-blue-300",
    icon: <TrendingUp size={16} />
  },
  {
    id: 3,
    title: "Tableta Digitalizadora Wacom Intuos Pro",
    faculty: "Arquitectura",
    modality: "Alquiler",
    price: "S/ 15.00/día",
    originalPrice: null,
    imageColor: "bg-pink-100",
    badgeColor: "bg-yellow-300",
    icon: <Clock size={16} />
  },
  {
    id: 4,
    title: "Kit Arduino Mega + 37 Sensores",
    faculty: "Ing. Electrónica",
    modality: "Préstamo",
    price: "Gratis",
    originalPrice: null,
    imageColor: "bg-green-100",
    badgeColor: "bg-pink-300",
    icon: <HeartHandshake size={16} />
  },
  {
    id: 5,
    title: "Osciloscopio Digital Rigol DS1054Z",
    faculty: "Ing. Electrónica",
    modality: "Alquiler",
    price: "S/ 30.00/día",
    originalPrice: "S/ 50.00/día",
    imageColor: "bg-orange-100",
    badgeColor: "bg-yellow-300",
    icon: <Clock size={16} />
  },
  {
    id: 6,
    title: "Cámara Réflex Canon EOS Rebel T7",
    faculty: "Comunicaciones",
    modality: "Venta",
    price: "S/ 1200.00",
    originalPrice: null,
    imageColor: "bg-gray-200",
    badgeColor: "bg-blue-300",
    icon: <TrendingUp size={16} />
  }
];

export default function Home() {
  return (
    <div className="space-y-10 py-4">
      
      {/* Sección de Banner (Hero) */}
      <section className="bg-ranti-light rounded-3xl border-4 border-ranti-ink p-8 md:p-12 shadow-solid flex flex-col items-center text-center relative overflow-hidden">
        {/* Decoración geométrica fondo */}
        <div className="absolute -top-10 -left-10 w-32 h-32 bg-yellow-300 rounded-full border-4 border-ranti-ink opacity-50"></div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-pink-300 rounded-full border-4 border-ranti-ink opacity-50"></div>
        
        <div className="relative z-10 max-w-2xl">
          <div className="inline-block bg-ranti-dark text-white px-4 py-1.5 rounded-full border-4 border-ranti-ink mb-6 font-display font-bold text-sm shadow-solid-sm">
            Comunidad Santamariana
          </div>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-tight mb-4 text-ranti-ink"
              style={{ textShadow: '2px 2px 0px #ffffff' }}>
            Tus herramientas académicas, a un clic de distancia
          </h2>
          <p className="text-lg md:text-xl font-body font-bold text-gray-700 mb-8">
            Alquila, compra o pide prestado equipamiento especializado de manera segura dentro de la universidad.
          </p>
          <button className="bg-green-gradient text-ranti-ink px-8 py-3 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover hover:-translate-y-1 active:translate-y-1 active:shadow-solid-sm transition-all font-display font-bold text-lg">
            Explorar Catálogo
          </button>
        </div>
      </section>

      {/* Sección de Filtros Rápidos */}
      <section className="flex flex-col md:flex-row justify-between items-center gap-4">
        <h3 className="text-2xl font-display font-bold">Equipos Destacados</h3>
        
        <div className="flex flex-wrap gap-3">
          <button className="flex items-center gap-2 bg-ranti-ink text-white px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm shadow-solid-sm active:translate-y-1 active:shadow-none transition-all">
            <Filter size={16} /> Todos
          </button>
          <button className="bg-yellow-300 text-ranti-ink px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm shadow-solid-sm hover:-translate-y-1 hover:shadow-solid transition-all">
            Solo Alquileres
          </button>
          <button className="bg-pink-300 text-ranti-ink px-4 py-2 rounded-xl border-4 border-ranti-ink font-bold text-sm shadow-solid-sm hover:-translate-y-1 hover:shadow-solid transition-all">
            Préstamos Solidarios
          </button>
        </div>
      </section>

      {/* Grid de Productos */}
      {/* Grid de Productos (MODIFICADO PARA NAVEGACIÓN) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 md:gap-8">
        {mockProducts.map((product) => (
          /* Reemplazamos el <div> principal por <Link> */
          <Link 
            to={`/producto/${product.id}`} 
            key={product.id} 
            className="bg-white rounded-3xl border-4 border-ranti-ink p-4 shadow-solid hover:-translate-y-2 hover:shadow-solid-hover transition-all duration-300 flex flex-col h-full group cursor-pointer block"
          >
            {/* Contenedor de Imagen */}
            <div className={`aspect-square ${product.imageColor} rounded-2xl border-4 border-ranti-ink mb-4 overflow-hidden relative flex items-center justify-center`}>
              <span className={`absolute top-3 left-3 ${product.badgeColor} text-ranti-ink text-xs font-display font-bold px-3 py-1.5 rounded-full border-4 border-ranti-ink flex items-center gap-1 shadow-solid-sm`}>
                {product.icon} {product.modality}
              </span>
              <div className="text-6xl font-display font-bold text-ranti-ink opacity-20 group-hover:scale-110 transition-transform duration-300">
                FOTO
              </div>
            </div>
            
            {/* Información del Producto */}
            <div className="flex-grow flex flex-col justify-between">
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{product.faculty}</p>
                <h3 className="font-display font-bold text-xl leading-tight mb-3 line-clamp-2 text-ranti-ink">
                  {product.title}
                </h3>
              </div>
              
              <div className="flex items-end justify-between mt-auto pt-4 border-t-4 border-gray-100">
                <div>
                  {product.originalPrice && (
                    <p className="text-sm font-bold text-gray-400 line-through decoration-2">
                      {product.originalPrice}
                    </p>
                  )}
                  <p className="font-display font-bold text-2xl text-ranti-dark">
                    {product.price.split('/')[0]}
                    {product.price.includes('/') && <span className="text-base text-gray-600">/día</span>}
                  </p>
                </div>
                
                {/* Botón visual (La navegación la maneja el <Link> padre) */}
                <div className="bg-ranti-secondary p-3 rounded-xl border-4 border-ranti-ink shadow-solid-sm group-hover:bg-ranti-primary transition-all group-hover:animate-pulse">
                  <ShoppingCart size={22} className="text-white" strokeWidth={2.5} />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* Paginación / Cargar más */}
      <div className="flex justify-center pt-8">
        <button className="bg-white text-ranti-ink px-8 py-3 rounded-full border-4 border-ranti-ink font-display font-bold text-lg shadow-solid hover:bg-gray-50 active:translate-y-1 active:shadow-solid-sm transition-all">
          Cargar más equipos
        </button>
      </div>

    </div>
  );
}