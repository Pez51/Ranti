import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiAssetUrl, apiRequest } from '../../lib/api';
import { getSession, updateSessionProfile } from '../../lib/auth';
import AcademicCombobox from './AcademicCombobox';
import { preparePhoto } from '../../lib/prepare-photo';
import { useToast } from '../../lib/toast-context';

export default function UserProfile() {
  const navigate = useNavigate();
  const { showSuccessToast } = useToast();
  const token = getSession()?.token;
  const [profile, setProfile] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [faculty, setFaculty] = useState('');
  const [career, setCareer] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [careerSearch, setCareerSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef(null);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  useEffect(() => {
    if (!token) return;
    let current = true;
    Promise.all([
      apiRequest('/users/me', { token }),
      apiRequest('/users/academic-catalog', { token }),
    ])
      .then(([data, options]) => {
        if (!current) return;
        const entries = Array.isArray(options) ? options : [];
        const entry = entries.find(item => item.faculty === data.faculty);
        setCatalog(entries);
        setFaculty(entry?.faculty || '');
        setCareer(entry?.careers.includes(data.career) ? data.career : '');
        setFacultySearch(entry?.faculty || '');
        setCareerSearch(entry?.careers.includes(data.career) ? data.career : '');
        setProfile(data);
      })
      .catch(failure => { if (current) setError(failure.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, revision]);

  function retry() {
    setError(''); setNotice(''); setProfile(null); setLoading(true);
    setRevision(value => value + 1);
  }

  function explainInvalidField(event) {
    setNotice('');
    setError(['faculty', 'career'].includes(event.target.id)
      ? 'Para guardar, selecciona una facultad y una carrera de la lista. Escribir para buscar no basta: escoge una opción.'
      : 'Completa el nombre visible para guardar tu perfil.');
  }

  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!data.get('display_name').trim()) {
      setError('Completa el nombre visible para guardar tu perfil.');
      return;
    }
    const photo = form.elements.namedItem('photo')?.files?.[0];
    const hasPhoto = !!photo;
    if ((['Estudiante', 'Egresado'].includes(profile.role) || faculty || career) &&
        !catalog.some(entry => entry.faculty === faculty && entry.careers.includes(career))) {
      setError('Escoge una facultad y una carrera válida de la UCSM.');
      return;
    }
    setBusy(true); setError(''); setNotice('');
    let detailsSaved = false;
    try {
      if (hasPhoto) setNotice('Preparando foto para subirla con un máximo de 2 MB…');
      const preparedPhoto = hasPhoto ? await preparePhoto(photo) : null;
      const updated = await apiRequest('/users/me', {
        token, method: 'PATCH',
        body: JSON.stringify({
          display_name: data.get('display_name').trim(),
          contact_number: data.get('contact_number').trim() || null,
          faculty: faculty || null,
          career: career || null,
        }),
      });
      detailsSaved = true;
      setProfile(updated);
      updateSessionProfile(updated, token);
      const result = hasPhoto
        ? await apiRequest('/users/me/photo', {
            token, method: 'PUT', body: preparedPhoto, headers: { 'Content-Type': preparedPhoto.type },
          })
        : updated;
      setProfile(result);
      updateSessionProfile(result, token);
      form.querySelector('input[name="photo"]').value = '';
      showSuccessToast('Tu perfil se guardó correctamente.');
      navigate('/', { replace: true });
    } catch (failure) {
      setNotice('');
      setError(detailsSaved
        ? `Los datos del perfil se guardaron, pero no se pudo subir la foto: ${failure.message}`
        : failure.message);
    } finally { setBusy(false); }
  }

  if (!token) return <p role="alert">Inicia sesión para ver tu perfil.</p>;
  const selectedFaculty = catalog.find(entry => entry.faculty === faculty);
  const academicRole = ['Estudiante', 'Egresado'].includes(profile?.role);
  return <div className="workflow max-w-3xl mx-auto">
    <h1>Mi perfil</h1>
    {loading && <p role="status">Cargando perfil…</p>}
    {error && <p role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <button disabled={loading || busy} onClick={retry}>Reintentar</button>
    {profile && <>
      {apiAssetUrl(profile.avatar_url) && <img src={apiAssetUrl(profile.avatar_url)} alt="Foto de perfil" className="h-28 w-28 rounded-full object-cover" />}
      <dl>
        <dt>Correo</dt><dd>{profile.email}</dd>
        <dt>Número de contacto</dt><dd>{profile.contact_number || 'No registrado'}</dd>
        <dt>Condición académica</dt><dd>{profile.academic_condition}</dd>
        <dt>Universidad</dt><dd>{profile.university}</dd>
        <dt>Estado de cuenta</dt><dd>Activa / Verificado (acceso confirmado por el servidor)</dd>
        <dt>Reputación</dt><dd>{profile.reputation_score ?? 'Sin datos'}</dd>
        <dt>Operaciones</dt><dd>{profile.operations_count ?? 'Sin datos'}</dd>
        <dt>Cuenta creada</dt><dd>{profile.created_at ? new Date(profile.created_at).toLocaleString() : 'Sin datos'}</dd>
      </dl>
      <form onSubmit={save} onInvalidCapture={explainInvalidField}>
        <fieldset disabled={busy}>
          <label>Nombre visible
            <input name="display_name" defaultValue={profile.display_name || ''} maxLength={100} required />
          </label>
          <label>Número de celular (opcional)
            <input name="contact_number" type="tel" defaultValue={profile.contact_number || ''} maxLength={20} />
          </label>
          <label>Foto de perfil (se ajusta automáticamente a un máximo de 2 MB)
            <input name="photo" type="file" accept="image/*" />
          </label>
          <p>Puedes elegir una foto grande. Ajustaremos su tamaño y calidad antes de subirla. Si tu navegador no reconoce el formato, usa JPEG, PNG o WebP.</p>
          {profile.faculty && !catalog.some(entry => entry.faculty === profile.faculty && entry.careers.includes(profile.career)) &&
            <p role="status">Tu facultad o carrera anterior no está en el catálogo; selecciona ambas para actualizar el perfil.</p>}
          <AcademicCombobox id="faculty" label="Facultad" text={facultySearch} selected={faculty}
            options={catalog.map(entry => entry.faculty)} required={academicRole || !!career}
            onInput={text => { setFacultySearch(text); setFaculty(''); setCareer(''); setCareerSearch(''); }}
            onSelect={value => { setFaculty(value); setFacultySearch(value); setCareer(''); setCareerSearch(''); }}
            onDismiss={() => setFacultySearch(faculty)} />
          <AcademicCombobox id="career" label="Carrera" text={careerSearch} selected={career}
            options={selectedFaculty?.careers || []} required={academicRole || !!faculty} disabled={!faculty}
            onInput={text => { setCareerSearch(text); setCareer(''); }}
            onSelect={value => { setCareer(value); setCareerSearch(value); }}
            onDismiss={() => setCareerSearch(career)} />
          <p>La condición académica se determina por tu correo institucional; no se edita aquí.</p>
          {academicRole && <p>Para guardar el perfil, selecciona tu facultad y carrera en las opciones de búsqueda.</p>}
          <button>{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </fieldset>
      </form>
    </>}
    <Link to="/mis-publicaciones">Gestionar mis publicaciones</Link>
  </div>;
}
