import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { decimalCents } from '../../lib/decimal-cents';
import { preparePhoto } from '../../lib/prepare-photo';
import { downloadEvidence } from './operation-evidence';
import { peruLocalToIso, peruTime } from './operation-time';
import './return-panel.css';

const inspectionLabels = { conforme: 'Conforme', danos: 'Daños', faltantes: 'Faltantes' };
const emptyDraft = { when: '', location: '', accessories: '', notes: '', result: '', retention: '' };
const soles = cents => `S/ ${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;

function readDraft(key) {
  try { return { ...emptyDraft, ...JSON.parse(sessionStorage.getItem(key) || '{}') }; }
  catch { return emptyDraft; }
}

export default function ReturnPanel({ operation, busy = false, onAction, token = null, onRefresh = null, onIncident = null, coordinationHref = null, movementsHref = null }) {
  const handoff = operation.handoff;
  const settlement = operation.return_settlement;
  const owner = handoff.is_owner;
  const active = operation.modality === 'Alquiler' && handoff.otp_required && handoff.delivered;
  const draftKey = `ranti:return:${operation.id}:${owner ? 'owner' : 'buyer'}`;
  const base = `/operations/${operation.id}/return-evidence`;
  const [draft, setDraft] = useState(() => readDraft(draftKey));
  const [confirmed, setConfirmed] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptanceChecked, setAcceptanceChecked] = useState(false);
  const [files, setFiles] = useState([]);
  const [evidence, setEvidence] = useState(null);
  const [revision, setRevision] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const photoInput = useRef(null);
  const formOpen = owner ? Boolean(settlement && !settlement.proposed && !settlement.decided) : !settlement;
  const uploadAllowed = owner ? formOpen : !settlement?.proposed && !settlement?.decided;
  const noInspection = Boolean(settlement && !settlement.proposed && !settlement.decided);
  const uploaded = evidence?.filter(file => file.phase === (owner ? 'inspection' : 'return')).length ?? 0;
  const tooManyFiles = uploaded + files.length > 5;
  const requested = decimalCents(draft.retention);
  const withDamage = owner && ['danos', 'faltantes'].includes(draft.result);
  const retention = withDamage ? requested : '0';
  const held = BigInt(decimalCents(String(settlement?.held ?? operation.requested_guarantee_amount ?? '0')) ?? 0);
  const requestedCents = BigInt(retention ?? 0);
  const ownerShare = requestedCents > held ? held : requestedCents;
  const chosenAmount = settlement?.decided ?? settlement?.proposed;
  const ownAmount = settlement?.decided?.[owner ? 'owner' : 'buyer'];
  const exactProposed = chosenAmount && BigInt(decimalCents(chosenAmount.owner) ?? 0) + BigInt(decimalCents(chosenAmount.excess) ?? 0);
  const at = peruLocalToIso(draft.when);
  const canSubmit = confirmed && at && draft.accessories && draft.notes.trim().length >= 3 && !files.length &&
    (owner ? draft.result && (!withDamage || (requestedCents > 0n && evidence?.some(file => file.phase === 'inspection'))) : draft.location.trim().length >= 3);

  useEffect(() => {
    if (!active || !operation.id) return;
    let current = true;
    apiRequest(base, { token }).then(result => {
      if (current) setEvidence(result.evidence ?? []);
    }).catch(failure => {
      if (current) setError(failure.message);
    });
    return () => { current = false; };
  }, [active, base, operation.id, token, revision]);

  useEffect(() => {
    if (!active || formOpen) return;
    try { sessionStorage.removeItem(draftKey); } catch { /* The browser may disable storage. */ }
  }, [active, draftKey, formOpen]);

  if (!active) return null;

  function change(field, value) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setNotice('');
  }

  function saveDraft() {
    setError('');
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(draft));
      setNotice('Borrador guardado en esta pestaña.');
    } catch {
      setError('No se pudo guardar el borrador en esta pestaña.');
    }
  }

  function act(action, fields = {}) {
    onAction({ action, revision: handoff.revision, ...fields });
  }

  function submit(event) {
    event.preventDefault();
    if (!canSubmit || busy || uploading) return;
    const fields = { notes: draft.notes.trim(), accessories_confirmed: draft.accessories === 'true' };
    if (owner) act('inspect-return', { ...fields, inspected_at: at, inspection_result: draft.result, retention_cents: retention });
    else act('record-return', { ...fields, returned_at: at, return_location: draft.location.trim() });
  }

  async function upload() {
    if (!files.length || tooManyFiles || uploading || busy) return;
    setUploading(true);
    setError('');
    setNotice('');
    let remaining = files;
    try {
      for (const file of files) {
        const photo = await preparePhoto(file);
        const result = await apiRequest(base, { token, method: 'POST', headers: {
          'Content-Type': photo.type,
          'X-File-Name': encodeURIComponent(file.name),
        }, body: photo });
        setEvidence(result.evidence);
        remaining = remaining.slice(1);
      }
      setNotice('Fotos adjuntadas.');
    } catch (failure) {
      setError(`${failure.message} Puedes reintentar con las fotos pendientes.`);
      setRevision(value => value + 1);
    } finally {
      if (photoInput.current) photoInput.current.value = '';
      setFiles(remaining);
      setUploading(false);
    }
  }

  async function openPhoto(file) {
    setError('');
    try { await downloadEvidence(`${base}/${file.id}`, token, file.name); }
    catch (failure) { setError(failure.message); }
  }

  return <section aria-label="Devolución y garantía" className="handoff-panel return-panel">
    <h3>{settlement?.decided ? 'Cierre validado del alquiler' : 'Devolución del equipo'}</h3>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {operation.return_overdue && <section className="return-overdue" aria-label="Devolución vencida">
      <h4>Devolución vencida</h4>
      <p>Fin pactado el {peruTime(operation.end_date)} (Perú). La devolución física sigue pendiente.</p>
      <p>La garantía afectada queda en revisión. Cualquier mora se rige por las condiciones aceptadas y cualquier exceso se gestiona por reclamo directo.</p>
      <button type="button" disabled={busy} onClick={() => onIncident?.('late_return', operation.overdue_case_id)}>
        {operation.overdue_case_id ? 'Ver expediente y actualizar incidencia' : 'Reportar devolución fuera de plazo'}
      </button>
      <a href={coordinationHref || `/operaciones/${encodeURIComponent(operation.id)}#coordinacion-${operation.id}`}>Ir al chat de la operación</a>
    </section>}
    <div className="return-layout">
      <div>
        <h4>{owner ? 'Recepción e inspección' : 'Devolución física'}</h4>
        {operation.end_date && <p>Fin pactado del alquiler: {peruTime(operation.end_date)} (Perú).</p>}
        {!settlement && owner && <p>El comprador debe registrar la devolución física para que puedas inspeccionar el equipo.</p>}
        {settlement && <dl>
          {settlement.return_at && <><dt>Devolución declarada</dt><dd>{peruTime(settlement.return_at)} (Perú)</dd></>}
          {settlement.return_location && <><dt>Punto de devolución</dt><dd>{settlement.return_location}</dd></>}
          {settlement.return_accessories_confirmed != null && <><dt>Accesorios declarados</dt><dd>{settlement.return_accessories_confirmed ? 'Completos' : 'Con faltantes'}</dd></>}
          <dt>Estado y observaciones</dt><dd>{settlement.return_notes}</dd>
        </dl>}
        {noInspection && <dl>
          <dt>Estado</dt><dd>{operation.pending_incidence_count > 0 ? 'Esperando inspección · Hay un expediente abierto' : 'Esperando inspección'}</dd>
          {settlement.notified_at && <><dt>Notificación registrada en el chat</dt><dd>{peruTime(settlement.notified_at)} (Perú)</dd></>}
          {settlement.inspection_due_at && <><dt>Límite de inspección</dt><dd>{peruTime(settlement.inspection_due_at)} (Perú)</dd></>}
        </dl>}
        {noInspection && settlement.inspection_due_at && <p>Si vence el plazo sin acta ni expediente abierto, se valida el cierre con S/ 0.00 de garantía para el oferente.</p>}
        {settlement?.inspected_at && <dl>
          <dt>Recepción registrada por el oferente</dt><dd>{peruTime(settlement.inspected_at)} (Perú)</dd>
          {settlement.inspection_result && <><dt>Resultado de inspección</dt><dd>{inspectionLabels[settlement.inspection_result]}</dd></>}
          {settlement.inspection_accessories_confirmed != null && <><dt>Accesorios verificados</dt><dd>{settlement.inspection_accessories_confirmed ? 'Completos' : 'Con faltantes'}</dd></>}
        </dl>}
        {settlement?.inspection_notes && <p>{settlement.inspection_notes}</p>}
        {formOpen && <form onSubmit={submit}>
          <fieldset disabled={busy || uploading}>
            <label>{owner ? 'Fecha y hora real de recepción (Perú)' : 'Fecha y hora real de devolución (Perú)'}
              <input type="datetime-local" step="1" required value={draft.when} onChange={event => change('when', event.target.value)} />
            </label>
            {!owner && <label>Punto de devolución
              <input required minLength={3} maxLength={200} value={draft.location} onChange={event => change('location', event.target.value)} />
            </label>}
            <label>Estado de los accesorios
              <select required value={draft.accessories} onChange={event => change('accessories', event.target.value)}>
                <option value="">Selecciona el estado</option><option value="true">Equipo y accesorios completos</option><option value="false">Hay faltantes</option>
              </select>
            </label>
            {owner && <label>Resultado de inspección
              <select required value={draft.result} onChange={event => change('result', event.target.value)}>
                <option value="">Selecciona el resultado</option>
                {Object.entries(inspectionLabels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}
              </select>
            </label>}
            <label>{owner ? 'Motivo y observaciones de la inspección' : 'Estado y observaciones'}
              <textarea required minLength={3} maxLength={1000} value={draft.notes} onChange={event => change('notes', event.target.value)} />
            </label>
            {withDamage && <label>Importe reclamado de garantía (S/)
              <input required inputMode="decimal" value={draft.retention} onChange={event => change('retention', event.target.value)} />
            </label>}
            <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
              {owner ? ' Confirmo que recibí el equipo y revisé sus accesorios.' : ' Confirmo la devolución física y los datos registrados.'}
            </label>
            {withDamage && <p>Adjunta fotos de los daños o faltantes y especifica el importe reclamado para notificar el acta.</p>}
            <div className="operation-panel-actions">
              <button type="button" onClick={saveDraft}>{owner ? 'Guardar borrador de inspección' : 'Guardar borrador'}</button>
              <button disabled={!canSubmit}>{owner ? (withDamage
                ? requested ? `Solicitar ${soles(requestedCents)} de garantía` : 'Solicitar garantía'
                : 'Registrar recepción conforme') : 'Registrar devolución'}</button>
            </div>
          </fieldset>
        </form>}
        {(uploadAllowed || evidence?.length > 0) && <section aria-label="Fotos de la devolución y la inspección">
          <h4>Fotos y evidencias</h4>
          {evidence?.map(file => <button type="button" key={file.id} onClick={() => openPhoto(file)}>
            {file.phase === 'inspection' ? 'Inspección' : 'Devolución'} · Descargar {file.name}
          </button>)}
          {uploadAllowed && <fieldset disabled={uploading || busy}>
            <label>{owner ? 'Fotos de la inspección' : 'Fotos de la devolución'}
              <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple
                onChange={event => setFiles(Array.from(event.target.files || []))} />
            </label>
            <small>Hasta cinco fotos por participante. Adjuntaste {uploaded}.</small>
            {files.length > 0 && <p>{files.map(file => file.name).join(', ')}</p>}
            {tooManyFiles && <p role="status">Selecciona hasta {Math.max(0, 5 - uploaded)} fotos adicionales.</p>}
            <button type="button" disabled={!files.length || tooManyFiles} onClick={upload}>{uploading ? 'Adjuntando…' : 'Adjuntar fotos'}</button>
            {files.length > 0 && <button type="button" onClick={() => { photoInput.current.value = ''; setFiles([]); }}>Quitar selección</button>}
          </fieldset>}
          {evidence === null && error && <button type="button" onClick={() => { setError(''); setRevision(value => value + 1); }}>Reintentar consulta de fotos</button>}
        </section>}
      </div>
      <section aria-label="Garantía y acuerdo">
        <h4>{settlement?.decided ? 'Reparto aprobado' : 'Garantía y acuerdo'}</h4>
        <p>{settlement ? 'Garantía registrada en la prueba' : 'Garantía indicada en la operación'}: {soles(held)}.</p>
        {formOpen && owner && draft.result && retention !== null && <dl>
          <dt>Importe solicitado</dt><dd>{soles(requestedCents)}</dd>
          <dt>Para el oferente</dt><dd>{soles(ownerShare)}</dd>
          <dt>Saldo del comprador</dt><dd>{soles(held - ownerShare)}</dd>
          {requestedCents > held && <><dt>Exceso por reclamo directo</dt><dd>{soles(requestedCents - held)}</dd></>}
        </dl>}
        {formOpen && owner && <p>El comprador revisará el acta y el reparto. La garantía solo se aplica tras un acuerdo o resolución.</p>}
        {!chosenAmount && !owner && <><p>Podrás responder cuando el oferente registre el acta y el importe exacto.</p>
          <button type="button" disabled>Aceptar acta y reparto</button></>}
        {chosenAmount && <dl>
          <dt>{settlement.decided ? 'Importe aprobado' : 'Importe solicitado'}</dt><dd>{soles(exactProposed)}</dd>
          <dt>Saldo del comprador</dt><dd>S/ {chosenAmount.buyer}</dd>
          <dt>Parte para el oferente</dt><dd>S/ {chosenAmount.owner}</dd>
          {chosenAmount.excess !== '0.00' && <><dt>Exceso por reclamo directo, sin débito automático</dt><dd>S/ {chosenAmount.excess}</dd></>}
        </dl>}
        {settlement?.proposed && !settlement.decided && (operation.pending_incidence_count > 0 ?
          <p>El acta y la garantía están en revisión por un expediente abierto.</p> : owner ?
            <p>El comprador debe revisar el acta.</p> : <>
              {accepting ? <div role="group" aria-label="Confirmar reparto">
                <p>Se aplicarán S/ {chosenAmount.owner} al oferente y S/ {chosenAmount.buyer} al comprador.</p>
                <label><input type="checkbox" checked={acceptanceChecked} onChange={event => setAcceptanceChecked(event.target.checked)} /> Acepto el importe de {soles(exactProposed)} y el reparto indicado.</label>
                <button type="button" disabled={busy || !acceptanceChecked} onClick={() => act('accept-inspection')}>Confirmar acuerdo sobre la garantía</button>
                <button type="button" disabled={busy} onClick={() => { setAccepting(false); setAcceptanceChecked(false); }}>Volver al acta</button>
              </div> : <button type="button" disabled={busy} onClick={() => setAccepting(true)}>Aceptar el importe de {soles(exactProposed)}</button>}
              {onIncident && <button type="button" disabled={busy} onClick={() => onIncident('guarantee')}>No acepto · Abrir queja con evidencia</button>}
            </>)}
        {settlement?.decided && <>
          <p role="status">{settlement.closed_by_silence ? 'Cierre validado por falta de respuesta del oferente en el plazo de inspección.' : 'Devolución y reparto validados.'} Consulta los movimientos y las constancias para confirmar la recepción de cada importe.</p>
          {settlement.reference && <p>Referencia {settlement.reference}</p>}
          {owner && settlement.owner_destination && <p>Destino {settlement.owner_destination.label} •••• {settlement.owner_destination.last_four}</p>}
          {!owner && settlement.buyer_destination && <p>Destino {settlement.buyer_destination}</p>}
          {settlement.received_at && <p role="status">Recepción de prueba confirmada el {peruTime(settlement.received_at)} (Perú).</p>}
          {operation.finance_enabled
            ? <a href={movementsHref || `/operaciones/${encodeURIComponent(operation.id)}#movimientos-${operation.id}`}>Consultar movimientos del alquiler</a>
            : !settlement.received_at && ownAmount !== '0.00' &&
              <button type="button" disabled={busy} onClick={() => act('confirm-return-receipt')}>Confirmar recepción de S/ {ownAmount} de prueba</button>}
        </>}
        {onRefresh && !settlement?.decided && <button type="button" disabled={busy || uploading} onClick={onRefresh}>Consultar estado de devolución</button>}
      </section>
    </div>
  </section>;
}
