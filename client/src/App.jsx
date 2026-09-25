import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';

// Vistas del Catálogo
import Home from './features/catalog/Home';
import ProductDetail from './features/catalog/ProductDetail';

// Vistas de Dashboards
import OferenteDashboard from './features/dashboard/OferenteDashboard';
import AdminDashboard from './features/dashboard/AdminDashboard';

// Vistas de Operaciones y Transacciones
import Checkout from './features/operations/Checkout';
import EntregaOTP from './features/operations/EntregaOTP';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          {/* Ruta Principal: Catálogo */}
          <Route path="/" element={<Home />} />
          
          {/* Detalle de Producto dinámica según el ID */}
          <Route path="/producto/:id" element={<ProductDetail />} />

          {/* Rutas Transaccionales */}
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/entrega/:id" element={<EntregaOTP />} />

          {/* Paneles de Control */}
          <Route path="/oferente" element={<OferenteDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;