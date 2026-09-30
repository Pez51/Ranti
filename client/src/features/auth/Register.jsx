import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { saveSession } from '../../lib/auth';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const navigate = useNavigate();
  async function request(action) {
    const address = email.trim().toLowerCase();
    setError('');
    if (!/^[^\s@]+@(?:[a-z0-9-]+\.)*ucsm\.edu\.pe$/.test(address)) return setError('Usa un correo institucional UCSM válido.');
    if (action === 'register' && !accepted) return setError('Debes aceptar explícitamente los términos.');
    if (action === 'register' && (password.length < 8 || password.length > 72 || new TextEncoder().encode(password).length > 72)) return setError('La contraseña requiere entre 8 caracteres y 72 bytes.');
    if (action === 'confirm' && !/^\d{6}$/.test(code)) return setError('Ingresa los seis dígitos del código.');
    setBusy(action);
    try {
      const path = action === 'register' ? '/auth/register' : `/auth/verification/${action}`;
      const body = action === 'register' ? { email: address, password, acceptTerms: true, termsVersion: 'pilot-v1' } : action === 'resend' ? { email: address } : { challengeId: pending.challenge_id, code };
      const result = await apiRequest(path, { method: 'POST', body: JSON.stringify(body) });
      if (action === 'confirm') {
        if (!result.token || !result.user) throw new Error('No se pudo iniciar la sesión.');
        saveSession({ token: result.token, user: result.user }, false);
        navigate('/perfil', { replace: true });
      } else { setEmail(address); setPending(result); setPassword(''); setCode(''); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  }
  return <section className="workflow max-w-xl mx-auto">
    <h1>Crear cuenta UCSM</h1>
    <p>La cuenta permanece pendiente hasta confirmar la verificación institucional.</p>
    <form noValidate onSubmit={event => { event.preventDefault(); request('register'); }}>
      <fieldset disabled={Boolean(busy)}>
        <label>Correo institucional<input type="email" autoComplete="email" value={email} disabled={Boolean(pending)} onChange={e => setEmail(e.target.value)} /></label>
        {!pending && <>
          <label>Contraseña<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
          <details><summary>Términos del piloto — versión pilot-v1</summary><p>Usa tu propia identidad institucional, publica información y evidencias auténticas y comparte únicamente referencias que tengas derecho a utilizar. Este piloto usa verificación simulada cuando el servidor lo indica; no implica validación institucional real ni garantía de una operación.</p></details>
          <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />Acepto los términos del piloto, versión pilot-v1</label>
          <button type="submit">{busy === 'register' ? 'Creando…' : 'Crear cuenta'}</button>
        </>}
      </fieldset>
    </form>
    {pending && <div>
      <h2>Verificación pendiente</h2>
      {pending.status === 'verification_unavailable' ? <p role="status">El proveedor de verificación no está disponible. Tu cuenta sigue pendiente; puedes reintentar con Reenviar código.</p> : <p>Confirma el código antes de su vencimiento: {pending.expires_at ? new Date(pending.expires_at).toLocaleString() : 'Consulta al proveedor'}.</p>}
      {pending.simulation_code && <p>Código de piloto/prueba: {pending.simulation_code}. Es una simulación; no acredita entrega de correo real.</p>}
      {pending.challenge_id && <form onSubmit={e => { e.preventDefault(); request('confirm'); }}>
        <label>Código de verificación<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value)} /></label>
        <button disabled={Boolean(busy)}>{busy === 'confirm' ? 'Confirmando…' : 'Confirmar código'}</button>
      </form>}
    </div>}
    {error && <p role="alert">{error}</p>}
    <p>Un código incorrecto, expirado, ya usado o con intentos agotados puede producir el mismo mensaje del servidor. Solicita otro para continuar.</p>
    <button type="button" disabled={Boolean(busy)} onClick={() => request('resend')}>{busy === 'resend' ? 'Reenviando…' : 'Reenviar código'}</button>
    <Link to="/login">Ya tengo cuenta: ingresar</Link>
  </section>;
}
