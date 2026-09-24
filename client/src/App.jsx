import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './features/catalog/Home'; // Importamos la nueva vista
import OferenteDashboard from './features/dashboard/OferenteDashboard';
import AdminDashboard from './features/dashboard/AdminDashboard'; // Importar Admin

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Ruta Principal: Renderiza el Catálogo */}
          <Route path="/" element={<Home />} />

          {/* Placeholder: Dashboard Oferente */}
          <Route path="/oferente" element={<OferenteDashboard />} />

          {/* Placeholder: Dashboard Admin (Gestión de reportes) */}
          <Route path="/admin" element={<AdminDashboard />} />
          
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;