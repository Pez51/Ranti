import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';

const statusLabel = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
const metadataFields = [['documentType', 'Tipo de documento', 100], ['institution', 'Institución', 200], ['academicPeriod', 'Periodo académico', 100], ['note', 'Nota', 500]];

export default function UserProfile() {
  const token = getSession()?.token;
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token) return;
    let current = true;
    Promise.all([apiRequest('/users/me', { token }), apiRequest('/users/me/role-requests', { token })])
      .then(([data, requests]) => { if (current) { setProfile(data); setHistory(requests); } })
      .catch(failure => { if (current) setError(failure.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, revision]);
  function retry() { setError(''); setNotice(''); setProfile(null); setLoading(true); setRevision(value => value + 1); }
  async function save(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setError(''); setNotice('');
    try {
      const updated = await apiRequest('/users/me', { 
        token, 
        method: 'PATCH', 
        body: JSON.stringify({ 
          display_name: data.get('display_name').trim(), 
          contact_number: data.get('contact_number') ? data.get('contact_number').trim() : null, // <-- Nuevo campo extraído
          avatar_url: data.get('avatar_url').trim() || null, 
          faculty: data.get('faculty').trim() || null 
        }) 
      });
      setProfile(updated.user || updated); // Adaptado por si tu backend devuelve { success: true, user: {...} } o directo el objeto
      setNotice('Perfil guardado.');
    } catch (failure) { 
      setError(failure.message); 
    } finally { 
      setBusy(false); 
    }
  }
  async function requestRole(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const evidence = data.get('evidence_ref').trim();
    if (!/^https:\/\//.test(evidence)) return setError('La evidencia requiere una referencia HTTPS.');
    const metadata = Object.fromEntries(metadataFields.map(([key]) => [key, data.get(key).trim()]).filter(([, value]) => value));
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiRequest('/users/me/role-requests', { token, method: 'POST', body: JSON.stringify({ evidence_ref: evidence, evidence_metadata: metadata }) });
      setHistory(previous => [result, ...previous]); setNotice('Solicitud enviada para revisión.'); form.reset();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!token) return <p role="alert">Inicia sesión para ver tu perfil.</p>;
  return <div className="workflow max-w-3xl mx-auto">
    <h1>Mi perfil</h1>
    {loading && <p role="status">Cargando perfil…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button disabled={loading || busy} onClick={retry}>Reintentar</button>
    {profile && <>
      <dl>
        <dt>Correo</dt><dd>{profile.email}</dd>
        <dt>Número de contacto</dt><dd>{profile.contact_number || 'No registrado'}</dd> {/* <-- Dato visible */}
        <dt>Condición académica</dt><dd>{profile.academic_condition}</dd>
        <dt>Universidad</dt><dd>{profile.university}</dd>
        <dt>Estado de cuenta</dt><dd>Activa / Verificado (acceso confirmado por el servidor)</dd>
        <dt>Reputación</dt><dd>{profile.reputation_score ?? 'Sin datos'}</dd>
        <dt>Operaciones</dt><dd>{profile.operations_count ?? 'Sin datos'}</dd>
        <dt>Cuenta creada</dt><dd>{profile.created_at ? new Date(profile.created_at).toLocaleString() : 'Sin datos'}</dd>
      </dl>
      
      {/* Se agregó contact_number a la key para forzar el re-renderizado al guardar */}
      <form onSubmit={save} key={`${profile.display_name}-${profile.avatar_url}-${profile.faculty}-${profile.contact_number}`}>
        <fieldset disabled={busy}>
          <label>Nombre visible
            <input name="display_name" defaultValue={profile.display_name || ''} maxLength={100} required />
          </label>
          
          {/* <-- Nuevo Input para el celular --> */}
          <label>Número de celular (Opcional)
            <input name="contact_number" type="tel" defaultValue={profile.contact_number || ''} maxLength={20} />
          </label>

          <label>Avatar (URL HTTPS)
            <input name="avatar_url" type="url" pattern="https://.*" defaultValue={profile.avatar_url || ''} maxLength={2048} />
          </label>
          <label>Facultad
            <input name="faculty" defaultValue={profile.faculty || ''} maxLength={100} />
          </label>
          <p>Deja avatar o facultad vacíos para eliminarlos. Las métricas y la condición académica no se editan aquí.</p>
          <button>{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </fieldset>
      </form>
      <h2>Solicitudes de rol Estudiante</h2>
      {!history.length && <p>No tienes solicitudes registradas.</p>}
      {history.map(request => <article key={request.id}>
        <h3>{statusLabel[request.status] || request.status}</h3>
        <p>{request.created_at ? new Date(request.created_at).toLocaleString() : ''}</p>
        {request.review_reason && <p>{request.review_reason}</p>}
      </article>)}
      {profile.role === 'Egresado' && !history.some(request => request.status === 'pending') && <form onSubmit={requestRole}>
        <p>Presenta una referencia auténtica de tu condición actual. Solo un administrador puede decidir la solicitud.</p>
        <fieldset disabled={busy}>
          <label>Referencia de evidencia (HTTPS)<input name="evidence_ref" type="url" pattern="https://.*" maxLength={2048} required /></label>
          {metadataFields.map(([key, label, maxLength]) => <label key={key}>{label}<input name={key} maxLength={maxLength} /></label>)}
          <button>Solicitar rol Estudiante</button>
        </fieldset>
      </form>}
      {profile.role === 'Estudiante' && <p>Ya tienes el rol Estudiante; no necesitas solicitarlo de nuevo.</p>}
    </>}
    <Link to="/mis-publicaciones">Gestionar mis publicaciones</Link>
  </div>;
}
