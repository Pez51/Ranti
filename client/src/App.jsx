import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Search, Menu, ShoppingCart, User, MapPin } from 'lucide-react';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-[#FDFBF7] font-body text-ranti-ink flex flex-col">
        
        {/* Efecto de capas en el Header al estilo de la imagen referencial */}
        <div className="w-full bg-ranti-dark pb-2 border-b-4 border-ranti-ink">
          <div className="w-full bg-ranti-secondary pb-2 border-b-4 border-ranti-ink rounded-b-3xl">
            <header className="bg-green-gradient px-4 py-4 rounded-b-3xl border-b-4 border-ranti-ink flex flex-col gap-4">
              
              {/* Top Bar: Logo y Acciones */}
              <div className="container mx-auto flex items-center justify-between">
                
                {/* Botón Menú (Estilo píldora) */}
                <button className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover transition-all font-display font-bold active:translate-y-1 active:shadow-solid-sm">
                  <Menu size={20} />
                  <span className="hidden md:inline">MENÚ</span>
                </button>

                {/* Logo Central */}
                <h1 className="text-4xl md:text-5xl font-display font-bold text-white tracking-wide" style={{ textShadow: '3px 3px 0 #062912, -1px -1px 0 #062912, 1px -1px 0 #062912, -1px 1px 0 #062912, 1px 1px 0 #062912' }}>
                  ranti
                </h1>

                {/* Acciones Derecha */}
                <div className="flex gap-3">
                  <button className="bg-ranti-dark text-white p-2 md:px-6 md:py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-ranti-ink transition-all font-display font-bold flex items-center gap-2">
                    <User size={20} />
                    <span className="hidden md:inline">INGRESAR</span>
                  </button>
                </div>
              </div>

              {/* Barra de Búsqueda tipo Amazon */}
              <div className="container mx-auto">
                <div className="flex w-full md:w-3/4 lg:w-1/2 mx-auto bg-white rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden focus-within:shadow-solid-hover transition-all">
                  <select className="bg-gray-100 border-r-4 border-ranti-ink px-4 py-3 font-bold outline-none cursor-pointer hidden md:block">
                    <option>Todo</option>
                    <option>Equipos Topográficos</option>
                    <option>Cámaras</option>
                    <option>Calculadoras</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder="Busca instrumentales, herramientas o equipos..." 
                    className="flex-grow px-4 py-3 outline-none font-body font-semibold"
                  />
                  <button className="bg-ranti-secondary px-6 py-3 border-l-4 border-ranti-ink hover:bg-ranti-primary transition-colors">
                    <Search className="text-ranti-ink font-bold" size={24} />
                  </button>
                </div>
              </div>
            </header>
          </div>
        </div>

        {/* Pestañas de Navegación / Sub-header */}
        <nav className="bg-white border-b-4 border-ranti-ink py-2 overflow-x-auto whitespace-nowrap">
          <div className="container mx-auto px-4 flex gap-6 font-display font-bold text-sm md:text-base">
            <a href="#" className="flex items-center gap-1 hover:text-ranti-secondary"><MapPin size={18}/> Campus Central</a>
            <a href="#" className="hover:text-ranti-secondary">Alquiler Rápido</a>
            <a href="#" className="hover:text-ranti-secondary">Venta de Segunda</a>
            <a href="#" className="hover:text-ranti-secondary">Préstamo Solidario</a>
            <a href="#" className="hover:text-ranti-secondary">Arquitectura</a>
            <a href="#" className="hover:text-ranti-secondary">Ing. de Sistemas</a>
          </div>
        </nav>

        {/* Contenido Principal (Catálogo Grid) */}
        <main className="flex-grow container mx-auto p-4 md:p-8">
          <Routes>
            <Route path="/" element={
              <div className="space-y-8">
                
                {/* Banner Destacado */}
                <div className="text-center max-w-2xl mx-auto my-8">
                  <div className="inline-block bg-ranti-dark text-white px-4 py-1 rounded-full border-2 border-ranti-ink mb-4 font-bold text-sm">
                    Comunidad Estudiantil
                  </div>
                  <h2 className="text-4xl md:text-5xl font-display font-bold leading-tight mb-4">
                    Tus herramientas académicas, a un clic de distancia
                  </h2>
                </div>

                {/* Grid de Productos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Tarjeta de Producto de ejemplo */}
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((item) => (
                    <div key={item} className="bg-white rounded-3xl border-4 border-ranti-ink p-4 shadow-solid hover:-translate-y-1 hover:shadow-solid-hover transition-all flex flex-col h-full">
                      <div className="aspect-square bg-gray-100 rounded-2xl border-4 border-ranti-ink mb-4 overflow-hidden relative">
                        {/* Etiqueta de Modalidad */}
                        <span className="absolute top-2 left-2 bg-yellow-300 text-ranti-ink text-xs font-bold px-3 py-1 rounded-full border-2 border-ranti-ink">
                          {item % 2 === 0 ? 'Alquiler' : 'Venta'}
                        </span>
                        <img src={`https://placehold.co/400x400/E8F5E9/062912?text=Equipo+${item}`} alt="Equipo" className="w-full h-full object-cover" />
                      </div>
                      
                      <div className="flex-grow flex flex-col justify-between">
                        <div>
                          <h3 className="font-display font-bold text-lg leading-tight mb-1 line-clamp-2">Estación Total Topográfica Leica</h3>
                          <p className="text-sm font-semibold text-gray-500 mb-3">Facultad de Ing. Civil</p>
                        </div>
                        
                        <div className="flex items-end justify-between mt-auto">
                          <div>
                            <p className="text-xs font-bold text-gray-500 line-through">S/ 45.00/día</p>
                            <p className="font-display font-bold text-2xl text-ranti-dark">S/ 25.00<span className="text-sm">/día</span></p>
                          </div>
                          <button className="bg-green-gradient p-3 rounded-xl border-2 border-ranti-ink hover:bg-ranti-primary active:scale-95 transition-transform">
                            <ShoppingCart size={20} className="text-ranti-ink" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;