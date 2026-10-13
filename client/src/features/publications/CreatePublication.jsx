import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import PublicationForm from './PublicationForm';
import PublicationStatus from './PublicationStatus';
import PublicationPricingSummary from './PublicationPricingSummary';

export default function CreatePublication() {
  const token = getSession()?.token;
  const [publication, setPublication] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pricing,setPricing]=useState(null);
  const [step,setStep]=useState('details');
  const [formValues,setFormValues]=useState(null);
  async function save(body) {
    setBusy(true); setError('');
    try {
      const result = await apiRequest(publication ? `/publications/${publication.id}` : '/publications', { method: publication ? 'PATCH' : 'POST', token, body: JSON.stringify(body) });
      const saved=publication ? result : result.publication;
      setPublication(saved);setFormValues(saved);setDirty(false);
      const quote=await apiRequest(`/publications/${saved.id}/pricing`,{token});
      setPricing(quote);setStep('summary');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function submit() {
    setError('');
    if (!publication.images?.length || publication.images.length > 7) return setError('Agrega de 1 a 7 imágenes y guarda el borrador antes de enviar.');
    if (publication.risk_level === 3 && !publication.provenance_evidence_ref) return setError('Agrega la evidencia de procedencia y guarda el borrador antes de enviar.');
    setBusy(true);
    try { setPublication(await apiRequest(`/publications/${publication.id}/submit`, { method: 'POST', token })); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  if (!token) return <p role="alert">Inicia sesión para crear una publicación.</p>;
  return <div className="workflow max-w-3xl mx-auto">
    <h1>Crear publicación</h1>
    <p>Paso {step==='summary'?'2 de 2: revisa los montos antes de enviar.':'1 de 2: describe tu artículo y sus condiciones.'}</p>
    {publication && <PublicationStatus publication={publication} />}
    {step==='details' && (!publication || publication.status === 'Borrador') && <PublicationForm initial={formValues||undefined} label="Continuar publicación" busy={busy} onSave={save} onDirty={() => setDirty(true)} />}
    {step==='summary' && publication?.status==='Borrador' && pricing && <PublicationPricingSummary publication={publication} pricing={pricing} busy={busy} onBack={()=>setStep('details')} onPublish={submit}/>}
    {error && <p role="alert">{error}</p>}
    {publication?.status==='Borrador' && step==='details' && dirty && <p>Continúa para guardar los cambios y actualizar el resumen.</p>}
    <Link to="/mis-publicaciones">Gestionar mis publicaciones</Link>
  </div>;
}
