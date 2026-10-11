import { Link, useSearchParams } from 'react-router-dom';

export default function SubNav() {
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get('category');
  
  const getLinkStyle = (categoryName) => {
    const isActive = categoryName === 'Inicio' 
      ? !currentCategory && !searchParams.get('q')
      : currentCategory === categoryName;
    return `transition-colors underline-offset-4 hover:underline whitespace-nowrap px-2 py-1 ${isActive ? 'text-[#4ADE80] font-black' : 'text-ranti-ink hover:text-ranti-secondary'}`;
  };

  return (
    <nav className="bg-white border-b-4 border-ranti-ink py-3 shadow-sm w-full relative z-30">
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
  );
}