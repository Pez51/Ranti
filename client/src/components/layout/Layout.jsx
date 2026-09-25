import Header from './Header';
import SubNav from './SubNav';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-[#FDFBF7] font-body text-ranti-ink flex flex-col">
      {/* Zona de Cabeceras */}
      <Header />
      <SubNav />
      
      {/* Zona Dinámica de Contenido (Catálogo, Dashboards, Perfiles) */}
      <main className="flex-grow container mx-auto p-4 md:p-8">
        {children}
      </main>
      
      {/* Pie de Página Neo-brutalista (MODIFICADO) */}
      <footer className="bg-ranti-dark text-white p-6 border-t-4 border-ranti-ink text-center font-display font-bold mt-auto">
        <p className="mb-3 text-lg">Ranti UCSM © 2026 - Proyecto de Fin de Carrera</p>
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-body font-semibold text-gray-300">
          <a href="/privacidad" className="hover:text-white underline underline-offset-4 transition-colors">Derechos ARCO (Ley 29733)</a>
          <a href="/reclamaciones" className="hover:text-white underline underline-offset-4 transition-colors">Libro de Reclamaciones</a>
          <a href="/admin" className="hover:text-yellow-300 underline underline-offset-4 transition-colors">Portal Administrativo</a>
        </div>
      </footer>
    </div>
  );
}