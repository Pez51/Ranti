import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import ArcoCase from './ArcoCase';
import { formatDate, isResolved, reviewStates, rightLabel } from './arco';

const endpoint = '/privacy/admin/requests';

function DecisionForm({ item, token, onSaved }) {
  const [status, setStatus] = useState('En revisión');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    if (!preview) {
      const fields = new FormData(event.currentTarget);
      setPreview({ status, reason: fields.get('reason'), dueDate: fields.get('dueDate') || undefined,
        retentionReason: fields.get('retentionReason') || undefined, revision: item.revision });
      setError('');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await apiRequest(`${endpoint}/${item.id}/decision`, {
        method: 'POST', token, body: JSON.stringify(preview),
      });
      onSaved(result);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="border-t pt-3">
    <h3>Atender expediente</h3>
    <fieldset disabled={busy || Boolean(preview)} className={preview ? 'hidden' : ''}>
      <label>Estado de la solicitud
        <select value={status} onChange={event => setStatus(event.target.value)}>
          {reviewStates.map(state => <option key={state}>{state}</option>)}
        </select>
      </label>
      <label>Motivo o respuesta al titular<textarea name="reason" maxLength={4000} required /></label>
      <label>Fecha aplicable de atención<input name="dueDate" type="date" defaultValue={item.dueDate ?? ''} /></label>
      {isResolved(status) && <label>Datos conservados y motivo
        <textarea name="retentionReason" maxLength={2000} required={item.type === 'Cancelacion' && status === 'Parcialmente atendida'} />
      </label>}
    </fieldset>
    {preview && <div role="dialog" aria-label="Resumen de atención ARCO">
      <p><strong>{item.reference}</strong> pasará a <strong>{preview.status}</strong>.</p>
      <p className="whitespace-pre-wrap break-words">{preview.reason}</p>
      {preview.retentionReason && <p className="whitespace-pre-wrap break-words">{preview.retentionReason}</p>}
      {preview.dueDate && <p>Fecha aplicable {formatDate(preview.dueDate)}</p>}
      <button type="button" disabled={busy} onClick={() => setPreview(null)}>Editar atención</button>
    </div>}
    <button type="submit" disabled={busy}>{busy ? 'Registrando…' : preview ? 'Confirmar atención' : 'Revisar atención'}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function AdminArco({ token }) {
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [list, setList] = useState(null);
  const [item, setItem] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ offset: String(offset), ...(status ? { status } : {}) });
    apiRequest(`${endpoint}?${query}`, { token, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setList(result); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [token, offset, status, revision]);

  function reload(next = 0) {
    setList(null); setError(''); setOffset(next); setRevision(value => value + 1);
  }
  async function read(id) {
    if (reading) return;
    setReading(true); setError(''); setNotice('');
    try { setItem(await apiRequest(`${endpoint}/${id}`, { token })); }
    catch (failure) { setError(failure.message); }
    finally { setReading(false); }
  }
  function saved(result) {
    setItem(result); setNotice(`Atención registrada. ${result.reference} · ${result.status}.`); reload();
  }

  return <section aria-labelledby="admin-arco-title">
    <h2 id="admin-arco-title">Expedientes ARCO</h2>
    <label>Filtrar expedientes por estado
      <select value={status} onChange={event => { setStatus(event.target.value); reload(); }}>
        <option value="">Todos</option>
        {['Presentada', ...reviewStates].map(state => <option key={state}>{state}</option>)}
      </select>
    </label>
    <button type="button" onClick={() => reload(offset)}>Actualizar expedientes</button>
    {!list && !error && <p role="status">Cargando expedientes…</p>}
    {reading && <p role="status">Consultando expediente…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {list?.items.length === 0 && <p>No hay expedientes para este filtro.</p>}
    <ul className="divide-y">
      {list?.items.map(entry => <li key={entry.id} className="py-2">
        {entry.reference} · {rightLabel(entry.type)} · {entry.status} · {formatDate(entry.createdAt)}{' '}
        <button type="button" disabled={reading} onClick={() => read(entry.id)}>Abrir {entry.reference}</button>
      </li>)}
    </ul>
    {offset > 0 && <button type="button" disabled={!list} onClick={() => reload(Math.max(offset - 20, 0))}>Anterior</button>}
    {list?.nextOffset != null && <button type="button" onClick={() => reload(list.nextOffset)}>Siguiente</button>}
    {item && <article aria-label="Expediente para atención">
      <ArcoCase key={item.id} item={item} endpoint={endpoint} token={token} />
      {!isResolved(item.status) && <DecisionForm key={`${item.id}:${item.revision}`} item={item} token={token} onSaved={saved} />}
    </article>}
  </section>;
}
