import { useState } from 'react';
import { downloadGraduateEvidence, graduateDate, graduateStatus } from './graduate-accreditation';

export default function AccreditationDetail({ item, path, token }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function download(file) {
    setBusy(true); setError('');
    try { await downloadGraduateEvidence(`${path}/evidence/${file.id}`, token, file.name); }
    catch { setError('No se pudo descargar la constancia. Vuelve a consultar el expediente.'); }
    finally { setBusy(false); }
  }
  return <>
    <h3>{item.reference} · {graduateStatus(item.status)}</h3>
    <dl className="mt-3">
      <dt>Solicitante</dt><dd>{item.name}</dd>
      {item.email && <><dt>Correo de contacto</dt><dd>{item.email}</dd></>}
      <dt>Vínculo solicitado</dt><dd>Egresado UCSM{item.career ? ` · ${item.career}` : ''}</dd>
      <dt>Identidad</dt><dd>DNI ····{item.documentLast4}</dd>
      <dt>Enviado</dt><dd>{graduateDate(item.createdAt)}</dd>
      <dt>Última actualización</dt><dd>{graduateDate(item.updatedAt)}</dd>
      {item.reason && <><dt>Motivo</dt><dd className="whitespace-pre-wrap">{item.reason}</dd></>}
      {item.correction && <><dt>Corrección solicitada</dt><dd className="whitespace-pre-wrap">{item.correction}</dd></>}
    </dl>
    <h4 className="font-bold mt-4">Constancias privadas</h4>
    {item.evidence.map(file => <button key={file.id} type="button" disabled={busy} className="break-all"
      onClick={() => download(file)}>Descargar {file.name}</button>)}
    {error && <p role="alert">{error}</p>}
    <details><summary className="font-bold cursor-pointer">Historial del expediente</summary>
      <ol className="list-disc pl-5">
        {item.history.map(event => <li key={event.createdAt} className="my-2">
          {graduateDate(event.createdAt)} · {graduateStatus(event.status)}
          {event.reason && <div className="whitespace-pre-wrap break-words">{event.reason}</div>}
        </li>)}
      </ol>
    </details>
  </>;
}
