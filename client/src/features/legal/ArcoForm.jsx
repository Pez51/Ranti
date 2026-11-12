import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import ArcoCase from './ArcoCase';
import { arcoRights, encodeEvidence, formatDate, rightLabel } from './arco';

const endpoint = '/privacy/requests';
const fileTypes = 'application/pdf,image/jpeg,image/png,image/webp';

function RequestFields({ existing = null }) {
  return <>
    <label>Datos sobre los que solicitas atención
      <input name="dataScope" required maxLength={1000} defaultValue={existing?.dataScope} />
    </label>
    <label>{existing ? 'Describe la corrección' : 'Describe tu solicitud'}
      <textarea name="description" required rows={4} maxLength={4000} defaultValue={existing?.description} />
    </label>
    <label>{existing ? 'Adjuntar nuevo sustento (opcional)' : 'Adjuntar sustento (opcional)'}
      <input name="evidence" type="file" accept={fileTypes} />
    </label>
    <div className="text-sm text-gray-600">PDF hasta 5 MB. JPEG, PNG o WebP hasta 2 MB.</div>
  </>;
}

async function requestFields(form) {
  const fields = new FormData(form);
  const attachment = await encodeEvidence(form.elements.evidence.files[0]);
  return { fields, details: { dataScope: fields.get('dataScope'), description: fields.get('description'), attachment } };
}

function CorrectionForm({ item, token, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const { details } = await requestFields(event.currentTarget);
      const updated = await apiRequest(`${endpoint}/${item.id}/corrections`, { token, method: 'POST',
        body: JSON.stringify({ ...details, revision: item.revision }) });
      onSaved(updated, 'Corrección registrada.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="border-t pt-3">
    <h3>Subsanar solicitud</h3>
    <fieldset disabled={busy}>
      <RequestFields existing={item} />
      <button type="submit">{busy ? 'Enviando…' : 'Enviar corrección'}</button>
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function ArcoForm() {
  const session = getSession();
  return <ArcoWorkspace key={session?.token} session={session} />;
}

function ArcoWorkspace({ session }) {
  const token = session?.token;
  const submissionId = useRef(null);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [listVersion, setListVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    apiRequest(`${endpoint}?offset=${offset}`, { token, signal: controller.signal })
      .then(result => {
        if (!controller.signal.aborted) { setItems(result.items); setNextOffset(result.nextOffset ?? null); }
      })
      .catch(failure => { if (!controller.signal.aborted) setListError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, offset, listVersion]);

  function reload(offset = 0) {
    setLoading(true); setListError(''); setOffset(offset); setListVersion(current => current + 1);
  }

  function saved(record, message) {
    setSelected(record); setNotice(message); reload();
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || reading) return;
    const form = event.currentTarget;
    setBusy(true); setError(''); setNotice('');
    try {
      const { fields, details } = await requestFields(form);
      submissionId.current ??= globalThis.crypto.randomUUID();
      const result = await apiRequest(endpoint, { token, method: 'POST', body: JSON.stringify({
        ...details, submissionId: submissionId.current, type: fields.get('type'), identityConfirmed: fields.has('confirmed'),
      }) });
      submissionId.current = null;
      form.reset();
      saved(result, `Solicitud registrada. Expediente ${result.reference}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  async function read(id) {
    if (reading || busy) return;
    setReading(true); setListError(''); setNotice('');
    try { setSelected(await apiRequest(`${endpoint}/${id}`, { token })); }
    catch (failure) { setListError(failure.message); }
    finally { setReading(false); }
  }

  return <div className="workflow max-w-6xl mx-auto">
    <Link to="/perfil">← Volver a mi perfil</Link>
    <h1 className="flex items-center gap-3 mt-4"><ShieldCheck aria-hidden="true" /> Privacidad y derechos ARCO</h1>
    <div className="grid gap-5 lg:grid-cols-2">
      <section aria-labelledby="arco-new-title">
        <h2 id="arco-new-title">Nueva solicitud</h2>
        <form onSubmit={submit} onChange={() => { submissionId.current = null; }}>
          <fieldset disabled={busy || reading}>
            <legend className="font-bold">Derecho solicitado</legend>
            <div className="grid grid-cols-2 gap-x-3">
              {arcoRights.map(([value, label, description], index) => <label key={value} className="border rounded-lg p-3">
                <span className="flex items-center gap-2"><input className="!w-auto" type="radio" name="type" value={value} defaultChecked={index === 0} /> {label}</span>
                <span className="block text-sm font-normal text-gray-600">{description}</span>
              </label>)}
            </div>
            <RequestFields />
            <label><input type="checkbox" name="confirmed" required /> Confirmo mi identidad y solicitud</label>
            <div className="text-sm text-gray-600 break-all">Cuenta autenticada {session?.user?.email}</div>
            <button type="submit">{busy ? 'Registrando…' : 'Registrar solicitud ARCO'}</button>
          </fieldset>
        </form>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
      <section aria-labelledby="arco-cases-title">
        <h2 id="arco-cases-title">Mis expedientes</h2>
        <button type="button" onClick={() => reload(offset)} disabled={loading || reading || busy}>Consultar expedientes</button>
        {loading && <p role="status">Cargando expedientes…</p>}
        {reading && <p role="status">Consultando expediente…</p>}
        {listError && <p role="alert">{listError}</p>}
        {!loading && !listError && !items.length && <p>Aún no tienes expedientes.</p>}
        <ul className="divide-y">
          {items.map(item => <li key={item.id} className="py-2">
            <span className="block font-semibold">{item.reference} · {rightLabel(item.type)} · {item.status}</span>
            <span className="block text-sm">Registro {formatDate(item.createdAt)}</span>
            <button type="button" disabled={reading || busy} onClick={() => read(item.id)}>Consultar {item.reference}</button>
          </li>)}
        </ul>
        {offset > 0 && <button type="button" disabled={loading} onClick={() => reload(Math.max(offset - 20, 0))}>Anterior</button>}
        {nextOffset !== null && <button type="button" disabled={loading} onClick={() => reload(nextOffset)}>Siguiente</button>}
        {selected && <article aria-label="Detalle del expediente ARCO">
          <ArcoCase key={selected.id} item={selected} endpoint={endpoint} token={token} />
          {selected.status === 'Pendiente de subsanación' && <CorrectionForm key={`${selected.id}:${selected.revision}`} item={selected} token={token} onSaved={saved} />}
        </article>}
      </section>
    </div>
  </div>;
}
