import { useState } from 'react';
import { downloadArco, formatDate, isResolved, rightLabel } from './arco';

export default function ArcoCase({ item, endpoint, token }) {
  const [downloadError, setDownloadError] = useState('');
  const [downloading, setDownloading] = useState(false);
  async function download(relativePath, name) {
    setDownloadError(''); setDownloading(true);
    try { await downloadArco(`${endpoint}/${item.id}${relativePath}`, token, name); }
    catch { setDownloadError('No se pudo descargar el documento. Vuelve a consultar el expediente.'); }
    finally { setDownloading(false); }
  }
  return <div>
    <h3>{item.reference} · {rightLabel(item.type)}</h3>
    <dl className="mt-3">
      <dt>Estado</dt><dd>{item.status}</dd>
      {item.owner && <><dt>Cuenta del titular</dt><dd>{item.owner.email}</dd></>}
      {item.identityConfirmedAt && <><dt>Identidad confirmada</dt><dd>{formatDate(item.identityConfirmedAt)}</dd></>}
      <dt>Fecha de registro</dt><dd>{formatDate(item.createdAt)}</dd>
      <dt>Fecha aplicable de atención</dt><dd>{formatDate(item.dueDate)}</dd>
      {item.resolvedAt && <><dt>Fecha de respuesta</dt><dd>{formatDate(item.resolvedAt)}</dd></>}
      <dt>Datos solicitados</dt><dd className="whitespace-pre-wrap">{item.dataScope}</dd>
      <dt>Detalle</dt><dd className="whitespace-pre-wrap">{item.description}</dd>
      {item.reason && <><dt>{isResolved(item.status) ? 'Respuesta' : 'Motivo'}</dt><dd className="whitespace-pre-wrap">{item.reason}</dd></>}
      {item.retentionReason && <><dt>Conservación de datos</dt><dd className="whitespace-pre-wrap">{item.retentionReason}</dd></>}
    </dl>
    {item.evidence.length > 0 && <div className="mt-4">
      <h4 className="font-bold">Sustento privado</h4>
      {item.evidence.map(file => <button className="max-w-full break-all" key={file.id} type="button" disabled={downloading}
        onClick={() => download(`/evidence/${file.id}`, file.name)}>Descargar {file.name}</button>)}
    </div>}
    {isResolved(item.status) && <button type="button" disabled={downloading}
      onClick={() => download('/response', `${item.reference}-respuesta.txt`)}>Descargar respuesta</button>}
    {downloadError && <p role="alert">{downloadError}</p>}
    {item.history.length > 0 && <details><summary className="font-bold cursor-pointer">Historial del expediente</summary>
      <ol className="list-disc pl-5">
        {item.history.map((event, index) => <li key={index} className="my-2">
          {formatDate(event.createdAt)} · {event.status}
          {event.reason && <div className="whitespace-pre-wrap break-words">{event.reason}</div>}
        </li>)}
      </ol>
    </details>}
  </div>;
}
