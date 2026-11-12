import { financeDocumentFilename, financeDocumentHtml } from '../../lib/finance-documents';

export default function FinanceDocumentPreview({ document, onClose, onDownload, busy }) {
  return (
    <section aria-label="Vista previa del documento">
      <h4>{document.title}</h4>
      <p>{financeDocumentFilename(document)}</p>
      <iframe title={document.title} sandbox="" srcDoc={financeDocumentHtml(document)} width="100%" height="460" />
      <button type="button" disabled={busy} onClick={onDownload}>Descargar archivo</button>
      <button type="button" onClick={onClose}>Cerrar vista previa</button>
    </section>
  );
}
