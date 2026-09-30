import { useState } from 'react';

const empty = { title: '', description: '', category: '', condition: '', modality: 'Venta', price: '', guarantee_amount: '', available_from: '', available_until: '', images: [], provenance_evidence_ref: '' };
function https(value) {
  try { const url = new URL(value); return value.startsWith('https://') && Boolean(url.hostname) && !url.username && !url.password && !/[\s\\]/.test(value); }
  catch { return false; }
}

export default function PublicationForm({ initial = empty, onSave, onDirty = () => {}, busy = false, label = 'Guardar borrador' }) {
  const [values, setValues] = useState(() => ({ ...empty, ...initial, images: (initial.images || []).join('\n') }));
  const [error, setError] = useState('');
  function change(key, value) { setValues(previous => ({ ...previous, [key]: value })); onDirty(); }
  const sale = values.modality === 'Venta';
  const loan = values.modality === 'Préstamo';
  const exposure = Math.max(loan ? 0 : Number(values.price || 0), sale ? 0 : Number(values.guarantee_amount || 0));
  async function save(event) {
    event.preventDefault(); setError('');
    const images = values.images.split('\n').map(value => value.trim()).filter(Boolean);
    if (images.length > 4 || images.some(value => !https(value))) return setError('Usa como máximo 4 referencias de imágenes HTTPS válidas.');
    const provenance = values.provenance_evidence_ref?.trim() || null;
    if (provenance && !https(provenance)) return setError('La referencia de procedencia debe usar HTTPS.');
    const price = loan ? '0' : values.price === '' || values.price == null ? null : String(values.price);
    const guarantee = sale ? '0' : values.guarantee_amount === '' || values.guarantee_amount == null ? '0' : String(values.guarantee_amount);
    if ([price, guarantee].some(value => value != null && (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) > 99999999.99))) return setError('Usa montos positivos o cero, con hasta dos decimales.');
    const from = sale ? null : values.available_from || null;
    const until = sale ? null : values.available_until || null;
    if (Boolean(from) !== Boolean(until) || (from && new Date(from) >= new Date(until))) return setError('Completa un intervalo de disponibilidad válido, con fin posterior al inicio.');
    await onSave({ title: values.title.trim(), description: values.description.trim(), category: values.category.trim(), condition: values.condition.trim(), modality: values.modality, price, guarantee_amount: guarantee, available_from: from, available_until: until, images, provenance_evidence_ref: provenance });
  }
  return <form onSubmit={save} noValidate>
    <fieldset disabled={busy}>
      <label>Título<input value={values.title} maxLength={255} onChange={e => change('title', e.target.value)} /></label>
      <label>Descripción<textarea value={values.description} maxLength={5000} onChange={e => change('description', e.target.value)} /></label>
      <label>Categoría<input value={values.category} maxLength={100} onChange={e => change('category', e.target.value)} /></label>
      <label>Estado físico<input value={values.condition} maxLength={50} onChange={e => change('condition', e.target.value)} /></label>
      <label>Modalidad<select value={values.modality} onChange={e => change('modality', e.target.value)}><option>Venta</option><option>Alquiler</option><option>Préstamo</option></select></label>
      {!loan && <label>Precio (S/)<input type="number" min="0.01" max="99999999.99" step="0.01" value={values.price ?? ''} onChange={e => change('price', e.target.value)} /></label>}
      {loan && <p>Préstamo: precio cero. Puede declararse una garantía.</p>}
      {!sale && <>
        <label>Garantía (S/)<input type="number" min="0" max="99999999.99" step="0.01" value={values.guarantee_amount ?? ''} onChange={e => change('guarantee_amount', e.target.value)} /></label>
        <label>Disponible desde<input type="date" value={values.available_from?.slice(0, 10) || ''} onChange={e => change('available_from', e.target.value)} /></label>
        <label>Disponible hasta<input type="date" value={values.available_until?.slice(0, 10) || ''} onChange={e => change('available_until', e.target.value)} /></label>
        <p>Las fechas nuevas se interpretan a medianoche de Perú. La garantía declarada no implica cobro ni custodia.</p>
      </>}
      <label>Imágenes HTTPS (una por línea)<textarea value={values.images} onChange={e => change('images', e.target.value)} /></label>
      <p>Se requieren de 1 a 4 imágenes para enviar. Ingresa URLs existentes; este formulario no sube archivos.</p>
      <p>El mayor valor entre precio y garantía determina el riesgo: desde S/500 se requiere revisión; desde S/1000 también evidencia de procedencia. El servidor decide el nivel y estado finales.</p>
      {(exposure >= 1000 || values.provenance_evidence_ref) && <label>Procedencia (URL HTTPS)<input type="url" maxLength={2048} value={values.provenance_evidence_ref || ''} onChange={e => change('provenance_evidence_ref', e.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <button>{busy ? 'Guardando…' : label}</button>
    </fieldset>
  </form>;
}
