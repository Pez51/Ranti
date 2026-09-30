import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import PublicationForm from './PublicationForm';
import PublicationStatus from './PublicationStatus';

export default function CreatePublication() {
  const token = getSession()?.token;
  const [publication, setPublication] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(body) {
    setBusy(true); setError('');
    try {
      const result = await apiRequest(publication ? `/publications/${publication.id}` : '/publications', { method: publication ? 'PATCH' : 'POST', token, body: JSON.stringify(body) });
      setPublication(publication ? result : result.publication); setDirty(false);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function submit() {
    setError('');
    if (!publication.images?.length || publication.images.length > 4) return setError('Agrega de 1 a 4 imágenes y guarda el borrador antes de enviar.');
    if (publication.risk_level === 3 && !publication.provenance_evidence_ref) return setError('Agrega la evidencia de procedencia y guarda el borrador antes de enviar.');
    setBusy(true);
    try { setPublication(await apiRequest(`/publications/${publication.id}/submit`, { method: 'POST', token })); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!token) return <p role="alert">Inicia sesión para crear una publicación.</p>;
  return <div className="workflow max-w-3xl mx-auto">
    <h1>Crear publicación</h1>
    <p>Guarda un borrador, revisa los requisitos y luego envíalo.</p>
    {publication && <PublicationStatus publication={publication} />}
    {(!publication || publication.status === 'Borrador') && <PublicationForm busy={busy} onSave={save} onDirty={() => setDirty(true)} />}
    {error && <p role="alert">{error}</p>}
    {publication?.status === 'Borrador' && <><button disabled={busy || dirty} onClick={submit}>{busy ? 'Procesando…' : 'Enviar publicación'}</button>{dirty && <p>Guarda los cambios antes de enviar.</p>}</>}
    <Link to="/mis-publicaciones">Gestionar mis publicaciones</Link>
  </div>;
}
