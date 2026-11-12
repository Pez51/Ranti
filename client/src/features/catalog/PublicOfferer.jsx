import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../../lib/api';

export default function PublicOfferer() {
  const { id } = useParams();
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`/publications/${id}/offerer`, { signal: controller.signal })
      .then(profile => { if (!controller.signal.aborted) setResult({ id, profile }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ id, error: error.message }); });
    return () => controller.abort();
  }, [id]);
  const current = result?.id === id ? result : null;
  const profile = current?.profile;
  return <main className="workflow max-w-2xl mx-auto">
    <Link to={`/producto/${id}`}>Volver a la ficha</Link>
    <h1>Perfil público del oferente</h1>
    {current?.error && <p role="alert">{current.error}</p>}
    {!current && <p role="status">Cargando perfil…</p>}
    {profile && <>
      <h2>{profile.display_name}</h2>
      <dl>
        <dt>Condición académica</dt><dd>{profile.academic_condition} · UCSM</dd>
        <dt>En Ranti desde</dt><dd>{new Date(profile.joined_at).toLocaleDateString('es-PE', { month: 'long', year: 'numeric', timeZone: 'America/Lima' })}</dd>
        <dt>Operaciones</dt><dd>{profile.operations_count ?? 0}</dd>
        {[[profile.reputation.as_owner, 'Como oferente'], [profile.reputation.as_requester, 'Como solicitante']].map(([role, label]) =>
          <div key={label}><dt>{label}</dt><dd>{role.count ? `${role.score} de 5 · ${role.count} evaluaciones` : 'Sin evaluaciones'}</dd></div>)}
      </dl>
    </>}
  </main>;
}
