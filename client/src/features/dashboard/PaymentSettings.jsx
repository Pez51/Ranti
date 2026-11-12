import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { usePaymentProfile } from '../../lib/use-payment-profile';
import DemoCardFields from './DemoCardFields';
import DemoPayoutFields from './DemoPayoutFields';

const methods = {
  tarjeta_prueba: 'Tarjeta de prueba',
  yape_prueba: 'Yape de prueba',
  plin_prueba: 'Plin de prueba',
};
const channels = {
  banco_prueba: 'Cuenta bancaria de prueba',
  yape_prueba: 'Cuenta Yape de prueba',
  plin_prueba: 'Cuenta Plin de prueba',
};

export default function PaymentSettings() {
  const [params] = useSearchParams();
  const token = getSession()?.token;
  const [role, setRole] = useState(params.get('rol') === 'oferente' ? 'oferente' : 'comprador');
  const [buyer, setBuyer] = useState('tarjeta_prueba');
  const [validCard, setValidCard] = useState(false);
  const [channel, setChannel] = useState('banco_prueba');
  const [scenario, setScenario] = useState('verified_simulation');
  const [accepted, setAccepted] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const profileState = usePaymentProfile(token);
  const { profile } = profileState;
  const destination = params.get('volver');
  const backToProduct = /^\/producto\/[\w-]+(?:\/solicitar)?$/.test(destination ?? '') ? destination : '/';

  async function save(body, message) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await apiRequest('/users/me/payment-profile', { token, method: 'PATCH', body: JSON.stringify(body) });
      profileState.setProfile(result);
      setValidCard(false);
      setNotice(message);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const selected = accepted ?? profile?.accepted_methods ?? [];
  const payoutStatus = profile?.payout?.status;
  const verified = Boolean(profile?.payout && (!payoutStatus || payoutStatus==='verified_simulation'));
  return <main className="workflow max-w-3xl mx-auto">
    <Link to="/perfil">Volver a mi perfil</Link>
    <h1>Configura tus pagos y cobros</h1>
    <p>Usa datos ficticios para practicar cómo pagar y cómo recibir los abonos.</p>
    <div role="group" aria-label="Configuración por rol">
      <button type="button" disabled={busy} aria-pressed={role === 'comprador'} onClick={() => { setRole('comprador'); setNotice(''); }}>Comprador</button>
      <button type="button" disabled={busy} aria-pressed={role === 'oferente'} onClick={() => { setRole('oferente'); setValidCard(false); setNotice(''); }}>Oferente</button>
    </div>
    {(error || profileState.error) && <p role="alert">{error || profileState.error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!profile && !profileState.error && <p role="status">Cargando configuración…</p>}
    {profile && role === 'comprador' && <section>
      <h2>Mis métodos para pagar</h2>
      {profile.buyer_method && <p>Método preferido {profile.buyer_method === 'tarjeta_prueba' ? 'Visa •••• 4242' : methods[profile.buyer_method]}.</p>}
      {profile.buyer_method&&<button type="button" disabled={busy} onClick={()=>save({action:'remove_buyer'},'Preferencia de pago retirada.')}>Quitar método guardado</button>}
      <form onSubmit={event => { event.preventDefault(); save({ action: 'buyer', method: buyer }, 'Método preferido guardado.'); }}>
        <label>Método preferido<select value={buyer} onChange={event => { setBuyer(event.target.value); setValidCard(false); }}>
          {Object.entries(methods).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        {buyer === 'tarjeta_prueba' && <DemoCardFields key={notice} onValidity={setValidCard} />}
        <button disabled={busy || (buyer === 'tarjeta_prueba' && !validCard)}>{buyer === 'tarjeta_prueba' ? 'Guardar tarjeta de prueba' : 'Guardar método preferido'}</button>
      </form>
      {profile.buyer_method && <Link to={backToProduct}>{destination ? 'Volver a la publicación' : 'Explorar catálogo'}</Link>}
    </section>}
    {profile && role === 'oferente' && <>
      <section>
        <h2>1. Dónde recibiré mis ingresos</h2>
        <label>Destino preferido<select value={channel} onChange={event => setChannel(event.target.value)}>
          {Object.entries(channels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label>Resultado para esta prueba<select value={scenario} disabled={busy} onChange={event=>setScenario(event.target.value)}>
          <option value="verified_simulation">Verificada</option><option value="pending_simulation">Pendiente</option>
          <option value="observed_simulation">Observada</option><option value="rejected_simulation">Rechazada</option>
        </select></label>
        <DemoPayoutFields key={`${channel}:${notice}`} channel={channel} busy={busy}
          onVerify={() => save({ action: 'destination', channel, ...(scenario==='verified_simulation'?{}:{scenario}) }, 'Resultado de verificación registrado.')} />
        {profile.payout && <p>{verified?'Destino verificado en la simulación.':payoutStatus==='pending_simulation'?'Verificación pendiente.':
          payoutStatus==='observed_simulation'?'Destino observado. Corrige los datos y vuelve a verificar.':'Destino rechazado. Elige un destino válido y vuelve a verificar.'} {profile.payout.label} •••• {profile.payout.last_four} · PEN.</p>}
      </section>
      <section>
        <h2>2. Cómo me pagarán</h2>
        {!verified && <p>Verifica la cuenta receptora para habilitar este paso.</p>}
        <fieldset disabled={busy || !verified}>
          <legend>Medios que acepto</legend>
          {Object.entries(methods).map(([id, label]) => <label key={id}>
            <input type="checkbox" checked={selected.includes(id)} onChange={event => setAccepted(event.target.checked ? [...selected, id] : selected.filter(item => item !== id))} />{label}
          </label>)}
          <button type="button" disabled={!selected.length} onClick={() => save({ action: 'accepted', methods: selected }, 'Preferencias de cobro guardadas.')}>Guardar preferencias de cobro</button>
        </fieldset>
        {profile.owner_ready && <Link to="/publicar">Continuar a publicar</Link>}
      </section>
    </>}
  </main>;
}
