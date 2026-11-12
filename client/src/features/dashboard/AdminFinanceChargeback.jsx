import { useState } from 'react';
import { apiRequest } from '../../lib/api';

const statuses = { open: 'En disputa', won: 'Ganado', lost: 'Perdido' };
const recoveries = { receivable: 'Cuenta por cobrar de prueba', authorized_offset: 'Compensación autorizada registrada' };

export default function AdminFinanceChargeback({ row, token, onChange, formatAmount }) {
  const [reference, setReference] = useState('');
  const [evidence, setEvidence] = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [status, setStatus] = useState('won');
  const [recovery, setRecovery] = useState('receivable');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = row.chargeback;

  async function save() {
    setBusy(true);
    setError('');
    try {
      const data = current ?
        { action: 'resolve', status, ...(status === 'lost' ? { recovery } : {}) } :
        { action: 'open', amount_cents: amount, ...(deadline ? { evidence_deadline: `${deadline}:00-05:00` } : {}) };
      await apiRequest(`/admin/finance/${row.operation_id}/chargeback`,
        { token, method: 'POST', body: JSON.stringify({ ...data, reference, evidence }) });
      setReference('');
      setEvidence('');
      onChange();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary>Contracargo posterior al abono de prueba</summary>
      <p>Cargo {row.provider_reference} · Abono {row.payout_reference} por S/ {formatAmount(row.economics.owner_cents)}.</p>
      {current && <dl>
        <dt>Referencia de disputa</dt><dd>{current.external_reference}</dd>
        <dt>Importe disputado</dt><dd>S/ {formatAmount(current.amount_cents)}</dd>
        <dt>Estado</dt><dd>{statuses[current.status]}</dd>
        <dt>Evidencia</dt><dd>{current.evidence}</dd>
        {current.evidence_deadline && <><dt>Vence la evidencia</dt><dd>{new Date(current.evidence_deadline).toLocaleString('es-PE', { timeZone: 'America/Lima' })} (Perú)</dd></>}
        {current.resolution_reference && <><dt>Resolución registrada</dt><dd>{current.resolution_reference} · {current.resolution_evidence}</dd></>}
        {current.recovery && <><dt>Recuperación</dt><dd>{recoveries[current.recovery]}</dd></>}
      </dl>}
      {(!current || current.status === 'open') && <fieldset disabled={busy}>
        <legend>{current ? 'Resultado del contracargo' : 'Nuevo expediente de prueba'}</legend>
        {current ? <>
          <label>Resultado<select value={status} onChange={event => setStatus(event.target.value)}>
            <option value="won">Ganado · cerrar importe en disputa</option><option value="lost">Perdido</option>
          </select></label>
          {status === 'lost' && <label>Recuperación documentada<select value={recovery} onChange={event => setRecovery(event.target.value)}>
            {Object.entries(recoveries).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select></label>}
        </> : <>
          <label>Importe disputado (céntimos)<input value={amount} inputMode="numeric" maxLength={10} onChange={event => setAmount(event.target.value)} /></label>
          <label>Límite de evidencia (Perú)<input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)} /></label>
        </>}
        <label>Referencia {current ? 'de resolución' : 'de disputa'}<input value={reference} maxLength={100} onChange={event => setReference(event.target.value)} /></label>
        <label>Evidencia o referencia de los archivos<textarea value={evidence} maxLength={1000} onChange={event => setEvidence(event.target.value)} /></label>
        <button type="button" disabled={reference.trim().length < 3 || evidence.trim().length < 5 || (!current && !/^[1-9]\d{0,9}$/.test(amount))}
          onClick={save}>{current ? 'Registrar resolución' : 'Abrir expediente'}</button>
      </fieldset>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
