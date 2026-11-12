import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import AppToast from './components/layout/AppToast';
import RequireSession from './components/auth/RequireSession';

// Vistas Generales
import Home from './features/catalog/Home';
import ProductDetail from './features/catalog/ProductDetail';
import PublicOfferer from './features/catalog/PublicOfferer';
import NotFound from './components/layout/NotFound';

// Vistas de Autenticación, Publicación y Legal
import Login from './features/auth/Login';
import Register from './features/auth/Register';
import GraduateAccreditation from './features/auth/GraduateAccreditation';
import ManagePublications from './features/publications/ManagePublications';
import './features/workflows.css';
import PublicationPaymentSetup from './features/publications/PublicationPaymentSetup';
import ClaimsForm from './features/legal/ClaimsForm';
import ArcoForm from './features/legal/ArcoForm';

// Vistas de Operaciones
import Operations from './features/operations/Operations';
import Conversations from './features/operations/Conversations';
import ChatWorkspace from './features/operations/ChatWorkspace';

// Paneles (Dashboards)
import AdminDashboard from './features/dashboard/AdminDashboard';
import UserProfile from './features/dashboard/UserProfile';
import PaymentSettings from './features/dashboard/PaymentSettings';

function App() {
  return (
    <Router>
      <AppToast>
      <ChatWorkspace>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/producto/:id" element={<ProductDetail requirePaymentSetup />} />
          <Route path="/producto/:id/oferente" element={<PublicOfferer />} />
          <Route path="/producto/:id/solicitar" element={<RequireSession><ProductDetail requirePaymentSetup requestPage /></RequireSession>} />
          
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/acreditacion" element={<GraduateAccreditation />} />
          <Route path="/mis-publicaciones" element={<RequireSession><ManagePublications /></RequireSession>} />
          <Route path="/publicar" element={<RequireSession><PublicationPaymentSetup /></RequireSession>} />
          <Route path="/operaciones" element={<RequireSession><Operations /></RequireSession>} />
          <Route path="/operaciones/:id" element={<RequireSession><Operations /></RequireSession>} />
          <Route path="/mensajes" element={<RequireSession><Conversations /></RequireSession>} />
          <Route path="/mensajes/:id" element={<RequireSession><Conversations /></RequireSession>} />
          
          <Route path="/checkout/:id" element={<RequireSession><Operations /></RequireSession>} />
          <Route path="/entrega/:id" element={<RequireSession><Operations /></RequireSession>} />
          
          <Route path="/perfil" element={<RequireSession><UserProfile /></RequireSession>} /> {/* RUTA DEL DEMANDANTE */}
          <Route path="/perfil/pagos" element={<RequireSession><PaymentSettings /></RequireSession>} />
          <Route path="/oferente" element={<RequireSession><ManagePublications /></RequireSession>} />
          <Route path="/admin" element={<RequireSession allowedRoles={['Administrador']}><AdminDashboard /></RequireSession>} />
          
          <Route path="/reclamaciones" element={<RequireSession><ClaimsForm /></RequireSession>} />
          <Route path="/privacidad" element={<RequireSession><ArcoForm /></RequireSession>} />

          {/* RUTA COMODÍN (Debe ir siempre al final). Captura cualquier URL no definida */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
      </ChatWorkspace>
      </AppToast>
    </Router>
  );
}

export default App;
