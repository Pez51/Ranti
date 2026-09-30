import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import RequireSession from './components/auth/RequireSession';

// Vistas Generales
import Home from './features/catalog/Home';
import ProductDetail from './features/catalog/ProductDetail';
import NotFound from './components/layout/NotFound'; // <- IMPORTACIÓN NUEVA

// Vistas de Autenticación, Publicación y Legal
import Login from './features/auth/Login';
import Register from './features/auth/Register';
import ManagePublications from './features/publications/ManagePublications';
import './features/workflows.css';
import CreatePublication from './features/publications/CreatePublication';
import ClaimsForm from './features/legal/ClaimsForm';
import ArcoForm from './features/legal/ArcoForm';

// Vistas de Operaciones
import Checkout from './features/operations/Checkout';
import EntregaOTP from './features/operations/EntregaOTP';

// Paneles (Dashboards)
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
          <Route path="/registro" element={<Register />} />
          <Route path="/mis-publicaciones" element={<RequireSession><ManagePublications /></RequireSession>} />
          <Route path="/publicar" element={<RequireSession><CreatePublication /></RequireSession>} />
          
          <Route path="/checkout/:id" element={<RequireSession><Checkout /></RequireSession>} />
          <Route path="/entrega/:id" element={<RequireSession><EntregaOTP /></RequireSession>} />
          
          <Route path="/perfil" element={<RequireSession><UserProfile /></RequireSession>} /> {/* RUTA DEL DEMANDANTE */}
          <Route path="/oferente" element={<RequireSession><ManagePublications /></RequireSession>} />
          <Route path="/admin" element={<RequireSession allowedRoles={['Administrador']}><AdminDashboard /></RequireSession>} />
          
          <Route path="/reclamaciones" element={<RequireSession><ClaimsForm /></RequireSession>} />
          <Route path="/privacidad" element={<RequireSession><ArcoForm /></RequireSession>} />

          {/* RUTA COMODÍN (Debe ir siempre al final). Captura cualquier URL no definida */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
