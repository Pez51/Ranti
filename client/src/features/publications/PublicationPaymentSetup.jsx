import { Link } from 'react-router-dom';
import { getSession } from '../../lib/auth';
import { usePaymentProfile } from '../../lib/use-payment-profile';
import CreatePublication from './CreatePublication';

export default function PublicationPaymentSetup() {
  const { profile, error } = usePaymentProfile(getSession()?.token);
  if (error) return <p role="alert">{error}</p>;
  if (!profile) return <p role="status">Cargando configuración de cobros…</p>;
  if (profile.owner_ready) return <CreatePublication />;
  return <main className="workflow max-w-3xl mx-auto">
    <h1>Configura tus cobros antes de publicar</h1>
    <p>Verifica dónde recibirás los ingresos y elige los medios que aceptarás.</p>
    <Link to="/perfil/pagos?rol=oferente">Configurar cuenta receptora y medios de pago</Link>
  </main>;
}
