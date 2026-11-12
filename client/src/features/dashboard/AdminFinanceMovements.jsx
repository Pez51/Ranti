import { useState } from 'react';
import { apiRequest } from '../../lib/api';

const date = value => value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : 'Sin fecha';
const statuses = {
  confirmed: 'Confirmado', failed: 'Fallido', pending: 'Pendiente', unknown: 'En revisión',
  not_executed: 'Sin ejecución verificada', open: 'En disputa', won: 'Ganado', lost: 'Perdido',
};

function MovementReview({ path, token, initial }) {
  const [data, setData] = useState(null);
  const [outcome, setOutcome] = useState('unknown');
  const [reference, setReference] = useState('');
  const [evidence, setEvidence] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = `${path}/movements/${initial.key}/review`;

  async function consult(body) {
    setBusy(true);
    setError('');
    try {
      setData(await apiRequest(endpoint, { token, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Conciliación del movimiento de prueba">
      <button type="button" disabled={busy} onClick={() => consult()}>Consultar movimiento original</button>
      {data && <>
        <p>{data.movement.reference} · {data.reviews.length} consultas recientes</p>
        {data.reviews.map(item => (
          <p key={item.verification_reference}>{statuses[item.outcome]} · {item.verification_reference} · {date(item.recorded_at)} (Perú) · {item.evidence}</p>
        ))}
        <label>Estado verificado
          <select value={outcome} onChange={event => setOutcome(event.target.value)}>
            <option value="confirmed">Confirmado</option>
            <option value="not_executed">Sin ejecución verificada</option>
            <option value="unknown">Desconocido · mantener en revisión</option>
          </select>
        </label>
        <label>Referencia de consulta<input value={reference} maxLength={100} onChange={event => setReference(event.target.value)} /></label>
        <label>Evidencia<textarea value={evidence} maxLength={500} onChange={event => setEvidence(event.target.value)} /></label>
        <button type="button" disabled={busy || reference.trim().length < 3 || evidence.trim().length < 5}
          onClick={() => consult({ outcome, verification_reference: reference, evidence })}>Registrar resultado de la consulta</button>
      </>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export default function AdminFinanceMovements({ path, token, movements }) {
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  return (
    <details>
      <summary>Libro mayor de movimientos de prueba</summary>
      <label>Tipo de partida<select value={type} onChange={event => setType(event.target.value)}>
        <option value="">Todos</option>
        {movements.map(move => <option value={move.key} key={move.key}>{move.label}</option>)}
      </select></label>
      <label>Estado<select value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">Todos</option>
        {Object.entries(statuses).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
      </select></label>
      {movements.filter(move => (!type || move.key === type) && (!status || move.status === status)).map(move => (
        <details key={move.key}>
          <summary>{move.label} · S/ {move.amount} · {statuses[move.status]}</summary>
          <dl>
            <dt>Origen</dt><dd>{move.origin}</dd><dt>Destino</dt><dd>{move.destination}</dd>
            <dt>Referencia original</dt><dd>{move.reference}</dd>
            <dt>Fecha</dt><dd>{date(move.date)} (Perú)</dd>
          </dl>
          {move.can_review && <MovementReview path={path} token={token} initial={move} />}
        </details>
      ))}
    </details>
  );
}
