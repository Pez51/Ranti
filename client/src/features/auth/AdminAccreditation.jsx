import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import AccreditationDetail from './AccreditationDetail';
import { graduateDate, graduateEndpoint, graduateStates, graduateStatus } from './graduate-accreditation';

const endpoint = `${graduateEndpoint}/admin/requests`;
const effects = {
  approve: 'Se acreditará el vínculo Egresado UCSM y se habilitará el ingreso a la cuenta.',
  observe: 'Se enviará la corrección solicitada al expediente. La cuenta seguirá pendiente hasta recibir y revisar la subsanación.',
  reject: 'Se cerrará la acreditación con el motivo indicado. La cuenta seguirá sin acceso a operaciones.',
};

function AccreditationDecision({ item, token, onSave }) {
  const [decision, setDecision] = useState('approve');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!preview) {
      const fields = new FormData(event.currentTarget);
      setPreview({ decision, reason: fields.get('reason'), ...(decision === 'observe' ? { correction: fields.get('correction') } : {}), revision: item.revision });
      return;
    }
    setBusy(true);
    try {
      onSave(await apiRequest(`${endpoint}/${item.id}/decision`, { token, method: 'POST', body: JSON.stringify(preview) }));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="border-t pt-3">
    <h3>Decisión motivada</h3>
    <fieldset disabled={Boolean(preview) || busy} className={preview ? 'hidden' : ''}>
      <label>Resultado<select value={decision} onChange={event => setDecision(event.target.value)}>
        <option value="approve">Aprobar</option><option value="observe">Observar</option><option value="reject">Rechazar</option>
      </select></label>
      <label>Motivo verificable<textarea name="reason" rows={3} required maxLength={3000} /></label>
      {decision === 'observe' && <label>Corrección requerida<textarea name="correction" rows={2} required maxLength={1000} /></label>}
      <label><input type="checkbox" required /> Revisé la constancia y los permisos de acceso</label>
    </fieldset>
    {preview && <div role="dialog" aria-label="Resumen de decisión de acreditación">
      <p><strong>{item.reference}</strong> · {effects[preview.decision]}</p>
      <p className="whitespace-pre-wrap break-words">{preview.reason}</p>
      {preview.correction && <p className="whitespace-pre-wrap break-words">{preview.correction}</p>}
      <button type="button" disabled={busy} onClick={() => setPreview(null)}>Editar decisión</button>
    </div>}
    <button type="submit" disabled={busy}>{busy ? 'Registrando…' : preview ? 'Confirmar decisión' : 'Ver resumen de decisión'}</button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default function AdminAccreditation({ token }) {
  const [status, setStatus] = useState('En revisión');
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
    setItem(result); setNotice(`Decisión registrada. ${result.reference} · ${graduateStatus(result.status)}.`); reload();
  }

  return <section aria-labelledby="admin-accreditation-title">
    <h2 id="admin-accreditation-title">Acreditación de egresados</h2>
    <label>Estado de acreditación
      <select value={status} onChange={event => { setStatus(event.target.value); reload(); }}>
        <option value="">Todos</option>
        {graduateStates.map(state => <option value={state} key={state}>{graduateStatus(state)}</option>)}
      </select>
    </label>
    <button type="button" onClick={() => reload(offset)}>Actualizar cola</button>
    {!list && !error && <p role="status">Cargando acreditaciones…</p>}
    {reading && <p role="status">Consultando acreditación…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {list?.items.length === 0 && <p>No hay acreditaciones para este filtro.</p>}
    <ul className="divide-y">
      {list?.items.map(entry => <li key={entry.id} className="py-2">
        {entry.reference} · {entry.name} · {graduateStatus(entry.status)} · {graduateDate(entry.updatedAt)}{' '}
        <button type="button" disabled={reading} onClick={() => read(entry.id)}>Revisar {entry.reference}</button>
      </li>)}
    </ul>
    {offset > 0 && <button type="button" disabled={!list} onClick={() => reload(Math.max(offset - 20, 0))}>Anterior</button>}
    {list?.nextOffset != null && <button type="button" onClick={() => reload(list.nextOffset)}>Siguiente</button>}
    {item && <article aria-label="Expediente de acreditación">
      <AccreditationDetail key={item.id} item={item} path={`${endpoint}/${item.id}`} token={token} />
      {item.status === 'En revisión' && <AccreditationDecision key={`${item.id}:${item.revision}`} item={item} token={token} onSave={saved} />}
    </article>}
  </section>;
}
