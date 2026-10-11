import { Search, Menu, User, Bell } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
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

  // Estados para el buscador retráctil
  const [hideSearch, setHideSearch] = useState(false);
  const isHiddenRef = useRef(false); // Ref evita lecturas desactualizadas durante el scroll

  // LÓGICA DE SCROLL BLINDADA CONTRA TEMBLORES
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let isAnimating = false; // El candado
    
    const handleScroll = () => {
      if (isAnimating) return; // Ignora los empujones automáticos del navegador

      const currentScrollY = window.scrollY;
      const diff = currentScrollY - lastScrollY;

      // Si bajamos más de 20px, ocultar
      if (diff > 20 && currentScrollY > 100 && !isHiddenRef.current) {
        isHiddenRef.current = true;
        setHideSearch(true);
        isAnimating = true;
        setTimeout(() => { isAnimating = false; lastScrollY = window.scrollY; }, 400);
      } 
      // Si subimos más de 20px, mostrar
      else if (diff < -20 && isHiddenRef.current) {
        isHiddenRef.current = false;
        setHideSearch(false);
        isAnimating = true;
        setTimeout(() => { isAnimating = false; lastScrollY = window.scrollY; }, 400);
      } else if (!isAnimating) {
        lastScrollY = currentScrollY; // Solo actualiza si no estamos en medio de un salto
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  return (
    <>
      <style>
        {`
          @keyframes panGradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-bg-pan {
            background: linear-gradient(-45deg, #4ADE80, #22C55E, #16A34A, #4ADE80);
            background-size: 300% 300%;
            animation: panGradient 12s ease-in-out infinite;
          }
        `}
      </style>

      {/* STICKY SEGURO: style={{ overflowAnchor: 'none' }} desactiva la corrección automática del navegador */}
      <div 
        className="w-full bg-ranti-dark pb-2 border-b-4 border-ranti-ink sticky top-0 z-50"
        style={{ overflowAnchor: 'none' }}
      >
        <div className="w-full bg-ranti-secondary pb-2 border-b-4 border-ranti-ink rounded-b-3xl">
          <header className="rounded-b-3xl border-b-4 border-ranti-ink animate-bg-pan flex flex-col p-4 transition-all duration-300">
            
            <div className="container mx-auto flex items-center justify-between relative">
              <button onClick={() => setIsMenuOpen(true)} className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border-4 border-ranti-ink shadow-solid hover:shadow-solid-hover transition-all font-display font-bold active:translate-y-1 active:shadow-solid-sm z-10">
                <Menu size={20} />
                <span className="hidden md:inline">MENÚ</span>
              </button>

              <Link 
                to="/" 
                className="absolute left-1/2 -translate-x-1/2 text-4xl md:text-5xl font-display font-bold text-white tracking-wide hover:scale-110 transition-transform z-10" 
                style={{ textShadow: '3px 3px 0 #062912, -1px -1px 0 #062912, 1px -1px 0 #062912, -1px 1px 0 #062912, 1px 1px 0 #062912' }}
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

            {/* ANIMACIÓN CSS GRID: Esto encoje la barra sin temblores ni saltos de margen */}
            {/* ANIMACIÓN CSS GRID: Encoge la barra sin temblores */}
            <div 
              className={`grid transition-all duration-300 ease-in-out ${
                hideSearch ? 'grid-rows-[0fr] opacity-0 mt-0' : 'grid-rows-[1fr] opacity-100 mt-3'
              }`}
            >
              <div className="overflow-hidden px-2">
                {/* Se agrega mt-1.5 y mb-2.5 al form para que la sombra y la animación focus no se corten */}
                <form onSubmit={handleSearch} className="mt-1.5 mb-2.5 flex w-full md:w-3/4 lg:w-[60%] mx-auto bg-white rounded-full border-4 border-ranti-ink shadow-solid overflow-hidden focus-within:shadow-solid-hover transition-all focus-within:-translate-y-1">
                  
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
            </div>

          </header>
        </div>
      </div>

      <NotificationDrawer isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
      <MenuDrawer isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} isLoggedIn={isLoggedIn} user={session?.user} onLogout={handleLogout} />
    </>
  );
}