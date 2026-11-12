import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { saveSession } from '../../lib/auth';
import AccreditationDetail from './AccreditationDetail';
import { graduateEndpoint, graduateEvidence, graduateMedia, returnDestination } from './graduate-accreditation';

const portalKey = 'ranti-graduate-accreditation';

function AcademicFields({ catalog, existing }) {
  const [faculty, setFaculty] = useState(existing?.faculty || '');
  const [career, setCareer] = useState(existing?.career || '');
  const careers = catalog.find(group => group.faculty === faculty)?.careers || [];
  if (!catalog.length) return null;
  return <>
    <label>Facultad (opcional)<select name="faculty" value={faculty} onChange={event => { setFaculty(event.target.value); setCareer(''); }}>
      <option value="">Seleccionar facultad</option>
      {catalog.map(group => <option key={group.faculty}>{group.faculty}</option>)}
    </select></label>
    {faculty && <label>Carrera<select name="career" value={career} onChange={event => setCareer(event.target.value)} required>
      <option value="">Seleccionar carrera</option>
      {careers.map(option => <option key={option}>{option}</option>)}
    </select></label>}
  </>;
}

function ApplicationFields({ catalog, existing = null }) {
  return <>
    <label>Nombre y apellidos<input name="name" autoComplete="name" defaultValue={existing?.name} required maxLength={140} /></label>
    <p>Vínculo solicitado <strong>Egresado UCSM</strong></p>
    <AcademicFields catalog={catalog} existing={existing} />
    <label>{existing ? 'Actualizar DNI (opcional)' : 'DNI'}<input name="documentNumber" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required={!existing} /></label>
    <label>Constancia de egreso PDF<input name="evidence" type="file" accept="application/pdf,.pdf" required /></label>
    <p className="text-sm text-gray-600">Tamaño máximo de archivo 5 MB. Tu constancia se consulta en el expediente con acceso restringido.</p>
  </>;
}

function PasswordField({ label = 'Contraseña', name = 'password', newPassword = false }) {
  const [show, setShow] = useState(false);
  return <div>
    <label>{label}<input name={name} type={show ? 'text' : 'password'} autoComplete={newPassword ? 'new-password' : 'current-password'} minLength={8} required /></label>
    <button type="button" onClick={() => setShow(value => !value)}>{show ? 'Ocultar' : 'Mostrar'} {label.toLowerCase()}</button>
  </div>;
}

async function applicationFields(fields, file) {
  return { name: fields.get('name'), documentNumber: fields.get('documentNumber') || undefined,
    faculty: fields.get('faculty') || undefined, career: fields.get('career') || undefined,
    evidence: await graduateEvidence(file) };
}

export default function GraduateAccreditation() {
  const [query] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState(() => sessionStorage.getItem(portalKey));
  const [mode, setMode] = useState(query.has('solicitar') ? 'register' : 'access');
  const [catalog, setCatalog] = useState([]);
  const [item, setItem] = useState(null);
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`${graduateEndpoint}/catalog`, { signal: controller.signal }).then(setCatalog).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    apiRequest(`${graduateEndpoint}/me`, { token, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setItem(result); })
      .catch(failure => {
        if (controller.signal.aborted) return;
        if (failure.status === 401) { sessionStorage.removeItem(portalKey); setToken(null); setItem(null); }
        setError(failure.message);
      });
    return () => controller.abort();
  }, [token]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const credentials = { email: fields.get('email'), password: fields.get('password') };
      if (mode === 'register' && credentials.password !== fields.get('confirmation')) throw new Error('Las contraseñas deben coincidir.');
      const input = mode === 'register' ? { ...credentials, ...await applicationFields(fields, form.elements.evidence.files[0]),
        acceptedTerms: fields.has('acceptedTerms'), declaredCorrect: fields.has('declaredCorrect') } : credentials;
      const result = await apiRequest(`${graduateEndpoint}/${mode}`, {
        method: 'POST', body: JSON.stringify(input), ...(mode === 'register' ? { headers: graduateMedia } : {}),
      });
      sessionStorage.setItem(portalKey, result.token); setToken(result.token); setItem(result.application);
      setSession(result.session ?? null);
      if (mode === 'register') setNotice(`Acreditación enviada. Expediente ${result.application.reference}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function refresh() {
    setBusy(true); setError('');
    try { setItem(await apiRequest(`${graduateEndpoint}/me`, { token })); }
    catch (failure) {
      if (failure.status === 401) leave();
      setError(failure.message);
    } finally { setBusy(false); }
  }

  async function correct(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiRequest(`${graduateEndpoint}/me/corrections`, { token, headers: graduateMedia, method: 'POST',
        body: JSON.stringify({ ...await applicationFields(fields, form.elements.evidence.files[0]), revision: item.revision }) });
      setItem(result); setNotice('Corrección enviada para revisión.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  function leave() {
    sessionStorage.removeItem(portalKey); setToken(null); setItem(null); setSession(null); setMode('access'); setNotice('');
  }

  function openProfile() {
    saveSession(session, false);
    navigate(returnDestination(location.state?.from), { replace: true });
  }

  return <div className="workflow max-w-3xl mx-auto">
    <Link to="/login" state={location.state}>← Volver al ingreso</Link>
    <h1 className="mt-4">{item ? 'Estado de mi acreditación' : mode === 'register' ? 'Registro de egresado UCSM' : 'Consultar acreditación de egresado'}</h1>
    {item ? <>
      <article><AccreditationDetail key={item.id} item={item} path={`${graduateEndpoint}/me`} token={token} /></article>
      {item.status === 'En revisión' && <p>Tu acreditación está en revisión. Puedes consultar el expediente y su respuesta aquí.</p>}
      {item.status === 'Rechazado' && <p>Para revisar el motivo o solicitar orientación, consulta el expediente con el equipo de soporte de Ranti.</p>}
      {item.status === 'Pendiente de subsanación' && <form key={item.revision} onSubmit={correct}>
        <h2>Reenviar acreditación corregida</h2>
        <fieldset disabled={busy}>
          <ApplicationFields catalog={catalog} existing={item} />
          <button type="submit">{busy ? 'Enviando…' : 'Enviar corrección'}</button>
        </fieldset>
      </form>}
      {item.status === 'Verificado' && <div>
        <p>Tu acreditación habilita el acceso a la cuenta de egresado.</p>
        {session ? <button type="button" onClick={openProfile}>Continuar a mi cuenta</button>
          : <button type="button" onClick={leave}>Ingresar a mi cuenta</button>}
      </div>}
      <button type="button" disabled={busy} onClick={refresh}>Consultar estado</button>
      <button type="button" disabled={busy} onClick={leave}>Cerrar consulta</button>
    </> : <>
      <form key={mode} onSubmit={submit}>
        <fieldset disabled={busy}>
          <label>Correo electrónico<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <PasswordField newPassword={mode === 'register'} />
          {mode === 'register' && <>
            <PasswordField label="Confirmar contraseña" name="confirmation" newPassword />
            <ApplicationFields catalog={catalog} />
            <details><summary className="cursor-pointer font-bold">Términos y privacidad del piloto</summary>
              <p>Usa tus propios datos y acredita tu vínculo con UCSM. La constancia se utiliza para revisar tu solicitud y se restringe a tu cuenta y al personal autorizado.</p>
            </details>
            <label><input type="checkbox" name="acceptedTerms" required /> Acepto términos y privacidad</label>
            <label><input type="checkbox" name="declaredCorrect" required /> Declaro que la información es correcta</label>
          </>}
          <button type="submit">{busy ? 'Procesando…' : mode === 'register' ? 'Enviar para revisión' : 'Ingresar y consultar'}</button>
        </fieldset>
      </form>
      <button type="button" disabled={busy} onClick={() => { setError(''); setMode(value => value === 'access' ? 'register' : 'access'); }}>
        {mode === 'access' ? 'Registrarme y acreditar egreso' : 'Ya tengo expediente'}
      </button>
    </>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
