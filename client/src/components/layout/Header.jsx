import { Search, Menu, User, Bell } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import NotificationDrawer from './NotificationDrawer';
import MenuDrawer from './MenuDrawer';
import { clearSession, getSession } from '../../lib/auth';

export default function Header() {
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [session, setSession] = useState(() => getSession());
  const isLoggedIn = Boolean(session);
  
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('q') || '');
  const [conditionTerm, setConditionTerm] = useState(searchParams.get('condition') || '');
  const navigate = useNavigate();

  const [scrollDirection, setScrollDirection] = useState('up');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      const direction = scrollY > lastScrollY ? "down" : "up";
      if (direction !== scrollDirection && (Math.abs(scrollY - lastScrollY) > 10)) {
        setScrollDirection(direction);
      }
      lastScrollY = scrollY > 0 ? scrollY : 0;
      setIsScrolled(scrollY > 20);
    };
    window.addEventListener("scroll", updateScrollDirection);
    return () => window.removeEventListener("scroll", updateScrollDirection);
  }, [scrollDirection]);

  useEffect(() => {
    const refreshSession = () => setSession(getSession());
    window.addEventListener('ranti-auth-changed', refreshSession);
    window.addEventListener('storage', refreshSession);
    return () => {
      window.removeEventListener('ranti-auth-changed', refreshSession);
      window.removeEventListener('storage', refreshSession);
    };
  }, []);

  const handleLogout = () => {
    clearSession();
    setIsMenuOpen(false);
    navigate('/login');
  };

  const handleSearch = (e) => {
    e.preventDefault();
    const query = new URLSearchParams();
    if (searchTerm.trim()) query.set('q', searchTerm.trim());
    if (conditionTerm) query.set('condition', conditionTerm);
    if (searchParams.get('category')) query.set('category', searchParams.get('category'));
    navigate(`/?${query.toString()}`);
  };

  const noiseBackground = `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E")`;

  return (
    <>
      {/* 1. BLOQUE FANTASMA: Mantiene la separación con el catálogo para que no se oculte tras el header */}
      <div className="h-[140px] w-full" />

      {/* 2. CONTENEDOR FIXED: Reemplaza a "sticky". Esto fuerza que la barra verde oscura y el logo se anclen arriba SIEMPRE */}
      <div className="fixed top-0 left-0 w-full bg-ranti-dark pb-2 border-b-4 border-ranti-ink z-50">
        <div className="w-full bg-ranti-secondary pb-2 border-b-4 border-ranti-ink rounded-b-3xl transition-transform duration-300">
          <header 
            className="rounded-b-3xl border-b-4 border-ranti-ink flex flex-col gap-4 transition-all duration-500 ease-in-out"
            style={{ 
              background: `linear-gradient(to bottom right, #4ADE80, #22C55E), ${noiseBackground}`,
              padding: scrollDirection === 'down' && isScrolled ? '1rem' : '1rem 1rem 1.5rem 1rem' 
            }}
          >
            
            <div className="container mx-auto flex items-center justify-between relative">
              <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover transition-all font-display font-bold active:translate-y-1 active:shadow-solid-sm z-10">
                <Menu size={20} />
                <span className="hidden md:inline">MENÚ</span>
              </button>

              <Link 
                to="/" 
                className="absolute left-1/2 -translate-x-1/2 text-4xl md:text-5xl font-display font-bold text-white tracking-wide hover:scale-110 transition-transform z-10" 
                style={{ 
                  textShadow: '3px 3px 0 #062912, -1px -1px 0 #062912, 1px -1px 0 #062912, -1px 1px 0 #062912, 1px 1px 0 #062912',
                  filter: 'drop-shadow(0px 0px 8px rgba(255,255,255,0.4))'
                }}
              >
                ranti
              </Link>

              <div className="flex gap-2 md:gap-4 z-10">
                {isLoggedIn && <Link to="/operaciones" className="bg-white text-ranti-ink px-3 py-2 rounded-full border-4 border-ranti-ink shadow-solid font-display font-bold text-sm flex items-center">Mis operaciones</Link>}
                {isLoggedIn && (
                  <button onClick={() => setIsNotifOpen(true)} className="bg-yellow-300 text-ranti-ink p-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-yellow-400 transition-all relative active:translate-y-1 active:shadow-solid-sm">
                    <Bell size={20} strokeWidth={2.5} />
                  </button>
                )}

                <div className="hidden sm:flex gap-2">
                  {!isLoggedIn ? (
                    <Link to="/login" className="bg-white text-ranti-ink p-2 md:px-6 md:py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:bg-gray-100 transition-all font-display font-bold flex items-center gap-2">
                      <User size={20} />
                      <span className="hidden md:inline">INGRESAR</span>
                    </Link>
                  ) : (
                    <Link to="/perfil" className="w-11 h-11 bg-pink-200 rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden flex items-center justify-center hover:scale-105 transition-transform">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(session.user.email)}`} alt="Perfil" className="w-full h-full object-cover" />
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* 3. BÚSQUEDA Y ESTADO: Se esconden suavemente hacia arriba al scrollear */}
            <div 
              className={`container mx-auto transition-all duration-300 ease-in-out overflow-hidden ${
                scrollDirection === 'down' && isScrolled 
                  ? 'max-h-0 opacity-0 m-0' 
                  : 'max-h-24 opacity-100 pb-2'
              }`}
            >
              <form onSubmit={handleSearch} className="flex w-full md:w-3/4 lg:w-[60%] mx-auto bg-white rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden focus-within:shadow-solid-hover transition-all focus-within:-translate-y-1">
                <select 
                  value={conditionTerm}
                  onChange={(e) => setConditionTerm(e.target.value)}
                  className="bg-gray-100 border-r-4 border-ranti-ink px-4 py-3 font-bold text-sm outline-none cursor-pointer hidden sm:block text-ranti-ink hover:bg-gray-200 transition-colors"
                >
                  <option value="">Estado: Todos</option>
                  <option value="Nuevo">Nuevo</option>
                  <option value="Como nuevo">Como nuevo</option>
                  <option value="Buen estado">Buen estado</option>
                  <option value="Aceptable">Aceptable</option>
                </select>
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Busca calculadoras, cámaras..." 
                  className="flex-grow px-4 py-3 outline-none font-body font-bold text-ranti-ink placeholder-gray-400"
                />
                <button type="submit" className="bg-ranti-secondary px-6 py-3 border-l-4 border-ranti-ink hover:bg-ranti-primary transition-colors flex items-center justify-center group">
                  <Search className="text-ranti-ink group-hover:scale-110 transition-transform" size={24} strokeWidth={3} />
                </button>
              </form>
            </div>
          </header>
        </div>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} isLoggedIn={isLoggedIn} user={session?.user} onLogout={handleLogout} />
    </>
  );
}