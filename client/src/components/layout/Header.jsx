import { Search, Menu, ShoppingCart, User, Bell } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import NotificationDrawer from './NotificationDrawer';
import MenuDrawer from './MenuDrawer';
import CartDrawer from './CartDrawer';

export default function Header() {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  
  // Simulación de sesión (Cambia a false para ver el botón "Ingresar")
  const [isLoggedIn, setIsLoggedIn] = useState(true); 
  
  // Lógica del Buscador
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      navigate(`/?q=${encodeURIComponent(searchTerm)}`);
    } else {
      navigate('/');
    }
  };

  return (
    <>
      <div className="w-full bg-ranti-dark pb-2 border-b-4 border-ranti-ink sticky top-0 z-30">
        <div className="w-full bg-ranti-secondary pb-2 border-b-4 border-ranti-ink rounded-b-3xl">
          <header className="bg-green-gradient px-4 py-4 rounded-b-3xl border-b-4 border-ranti-ink flex flex-col gap-4">
            
            <div className="container mx-auto flex items-center justify-between">
              <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover transition-all font-display font-bold active:translate-y-1 active:shadow-solid-sm">
                <Menu size={20} />
                <span className="hidden md:inline">MENÚ</span>
              </button>

              <Link to="/" className="text-4xl md:text-5xl font-display font-bold text-white tracking-wide hover:scale-105 transition-transform" style={{ textShadow: '3px 3px 0 #062912, -1px -1px 0 #062912, 1px -1px 0 #062912, -1px 1px 0 #062912, 1px 1px 0 #062912' }}>
                ranti
              </Link>

              <div className="flex gap-2 md:gap-4">
                {isLoggedIn && (
                  <button onClick={() => setIsNotifOpen(true)} className="bg-yellow-300 text-ranti-ink p-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-yellow-400 transition-all relative active:translate-y-1 active:shadow-solid-sm">
                    <Bell size={20} strokeWidth={2.5} />
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border-2 border-ranti-ink">3</span>
                  </button>
                )}
                
                <button onClick={() => setIsCartOpen(true)} className="bg-white text-ranti-ink p-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-gray-100 transition-all active:translate-y-1 active:shadow-solid-sm relative">
                  <ShoppingCart size={20} strokeWidth={2.5} />
                  <span className="absolute -top-2 -right-2 bg-ranti-primary text-ranti-ink text-xs font-bold px-2 py-0.5 rounded-full border-2 border-ranti-ink">1</span>
                </button>

                <div className="hidden sm:flex gap-2">
                  {!isLoggedIn ? (
                    <Link to="/login" className="bg-white text-ranti-ink p-2 md:px-6 md:py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-gray-100 transition-all font-display font-bold flex items-center gap-2">
                      <User size={20} />
                      <span className="hidden md:inline">INGRESAR</span>
                    </Link>
                  ) : (
                    <div className="w-11 h-11 bg-pink-200 rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden flex items-center justify-center cursor-pointer" onClick={() => setIsMenuOpen(true)}>
                      <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="Perfil" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* FORMULARIO DE BÚSQUEDA FUNCIONAL */}
            <div className="container mx-auto pb-2">
              <form onSubmit={handleSearch} className="flex w-full md:w-3/4 lg:w-1/2 mx-auto bg-white rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden focus-within:shadow-solid-hover transition-all focus-within:-translate-y-1">
                <select className="bg-gray-100 border-r-4 border-ranti-ink px-4 py-3 font-bold text-sm outline-none cursor-pointer hidden sm:block">
                  <option value="todo">Todo Ranti</option>
                  <option value="alquiler">Alquileres</option>
                  <option value="venta">Ventas</option>
                </select>
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Busca calculadoras, cámaras..." 
                  className="flex-grow px-4 py-3 outline-none font-body font-bold text-ranti-ink placeholder-gray-400"
                />
                <button type="submit" className="bg-ranti-secondary px-6 py-3 border-l-4 border-ranti-ink hover:bg-ranti-primary transition-colors flex items-center justify-center">
                  <Search className="text-ranti-ink" size={24} strokeWidth={3} />
                </button>
              </form>
            </div>
          </header>
        </div>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} isLoggedIn={isLoggedIn} />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
    </>
  );
}