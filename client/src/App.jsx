import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';

// Vistas Generales
import Home from './features/catalog/Home';
import ProductDetail from './features/catalog/ProductDetail';
import NotFound from './components/layout/NotFound'; // <- IMPORTACIÓN NUEVA

// Vistas de Autenticación, Publicación y Legal
import Login from './features/auth/Login';
import CreatePublication from './features/publications/CreatePublication';
import ClaimsForm from './features/legal/ClaimsForm';
import ArcoForm from './features/legal/ArcoForm';

// Vistas de Operaciones
import Checkout from './features/operations/Checkout';
import EntregaOTP from './features/operations/EntregaOTP';

// Paneles (Dashboards)
import OferenteDashboard from './features/dashboard/OferenteDashboard';
import AdminDashboard from './features/dashboard/AdminDashboard';
import UserProfile from './features/dashboard/UserProfile'; // <- IMPORTACIÓN NUEVA

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/producto/:id" element={<ProductDetail />} />
          
          <Route path="/login" element={<Login />} />
          <Route path="/publicar" element={<CreatePublication />} />
          
          <Route path="/checkout/:id" element={<Checkout />} />
          <Route path="/entrega/:id" element={<EntregaOTP />} />
          
          <Route path="/perfil" element={<UserProfile />} /> {/* RUTA DEL DEMANDANTE */}
          <Route path="/oferente" element={<OferenteDashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
          
          <Route path="/reclamaciones" element={<ClaimsForm />} />
          <Route path="/privacidad" element={<ArcoForm />} />

          {/* RUTA COMODÍN (Debe ir siempre al final). Captura cualquier URL no definida */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;