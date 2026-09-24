import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        {/* Barra de navegación temporal */}
        <header className="bg-ranti-primary text-white p-4 shadow-md">
          <h1 className="text-2xl font-bold">Ranti UCSM</h1>
        </header>

        {/* Contenido principal */}
        <main className="flex-grow container mx-auto p-4 flex items-center justify-center">
          <Routes>
            <Route path="/" element={
              <div className="text-center">
                <h2 className="text-3xl font-semibold mb-2">Bienvenido a Ranti</h2>
                <p className="text-gray-600">
                  El frontend PWA y el enrutador están configurados correctamente.
                </p>
              </div>
            } />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;