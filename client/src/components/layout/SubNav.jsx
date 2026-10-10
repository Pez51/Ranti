import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function SubNav() {
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get('category');
  
  // Lógica de Scroll
  const [scrollDirection, setScrollDirection] = useState('up');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    const updateScrollDirection = () => {
      const scrollY = window.scrollY;
      const direction = scrollY > lastScrollY ? "down" : "up";
      if (direction !== scrollDirection && (scrollY - lastScrollY > 10 || scrollY - lastScrollY < -10)) {
        setScrollDirection(direction);
      }
      lastScrollY = scrollY > 0 ? scrollY : 0;
      setIsScrolled(scrollY > 20);
    };
    window.addEventListener("scroll", updateScrollDirection);
    return () => window.removeEventListener("scroll", updateScrollDirection);
  }, [scrollDirection]);

  const getLinkStyle = (categoryName) => {
    const isActive = categoryName === 'Inicio' 
      ? !currentCategory && !searchParams.get('q')
      : currentCategory === categoryName;
    return `transition-colors underline-offset-4 hover:underline whitespace-nowrap px-2 py-1 ${isActive ? 'text-[#4ADE80] font-black' : 'text-ranti-ink hover:text-ranti-secondary'}`;
  };

  return (
    <div className={`w-full sticky z-30 transition-all duration-300 ease-in-out ${scrollDirection === 'down' && isScrolled ? '-top-16 opacity-0' : 'top-[140px] opacity-100'}`}>
      <nav className="bg-white border-b-4 border-ranti-ink py-3 shadow-sm w-full relative">
        <div className="container mx-auto px-4 flex gap-6 overflow-x-auto hide-scrollbar text-sm md:text-base font-display font-bold md:justify-center">
          <Link to="/" className={getLinkStyle('Inicio')}>Inicio</Link>
          <div className="w-1 h-6 bg-gray-200 rounded-full hidden md:block"></div>
          <Link to="/?category=Tecnología" className={getLinkStyle('Tecnología')}>Tecnología</Link>
          <Link to="/?category=Instrumentos Médicos" className={getLinkStyle('Instrumentos Médicos')}>Instrumentos Médicos</Link>
          <Link to="/?category=Maquetas e Instrumentos" className={getLinkStyle('Maquetas e Instrumentos')}>Maquetas e Instrumentos</Link>
          <Link to="/?category=Equipos Audiovisuales" className={getLinkStyle('Equipos Audiovisuales')}>Equipos Audiovisuales</Link>
          <Link to="/?category=Libros y Textos" className={getLinkStyle('Libros y Textos')}>Libros y Textos</Link>
        </div>
      </nav>
    </div>
  );
}