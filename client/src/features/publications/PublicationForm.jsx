import { useContext,useEffect,useRef,useState } from 'react';
import { Star } from 'lucide-react';
import PublicationPhotos from './PublicationPhotos';
import ProvenanceUpload from './ProvenanceUpload';
import { rentalUnits,rentalUnitLabel } from '../../lib/rental-units';
import { ToastContext } from '../../lib/toast-context';
import { MAX_DESCRIPTION_CHARACTERS,publicationCategories,physicalConditions,modalityAdvice } from '../../lib/publication-options';

const empty = { title: '', description: '', category: '', condition: '', modality: 'Venta', price: '', guarantee_amount: '', available_from: '', available_until: '', images: [], provenance_evidence_ref: '' };
export default function PublicationForm({ initial = empty, onSave, onDirty = () => {}, busy = false, label = 'Guardar borrador' }) {
  const [values, setValues] = useState(() => ({ ...empty,rental_unit:'day', ...initial, images: (initial.images || []).map(image => typeof image === 'string' ? image : image.image_url) }));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const toast=useContext(ToastContext);
  const adviceShown=useRef(false);
  const [otherCategory,setOtherCategory]=useState(initial.category_other || (initial.category && !publicationCategories.includes(initial.category) ? initial.category : ''));
  const [selectedCategory,setSelectedCategory]=useState(initial.category ? (publicationCategories.includes(initial.category)?initial.category:'Otros') : '');
  const [rating,setRating]=useState(initial.condition_rating || Math.max(0,physicalConditions.indexOf(initial.condition)+1));
  const characters=values.description.length;
  useEffect(()=>{if(!adviceShown.current && toast?.showInfoToast){adviceShown.current=true;toast.showInfoToast(modalityAdvice[initial.modality||'Venta']);}},[toast,initial.modality]);
  function change(key, value) { setValues(previous => ({ ...previous, [key]: value })); onDirty(); }
  const sale = values.modality === 'Venta';
  const loan = values.modality === 'Préstamo';
  const exposure = Math.max(loan ? 0 : Number(values.price || 0), sale ? 0 : Number(values.guarantee_amount || 0));
  async function save(event) {
    event.preventDefault(); setError('');
    if (uploading || busy) return;
    if(characters>MAX_DESCRIPTION_CHARACTERS) return setError(`La descripción debe tener como máximo ${MAX_DESCRIPTION_CHARACTERS} caracteres.`);
    if(label==='Continuar publicación' && (!values.title.trim()||!values.description.trim()||!selectedCategory||!rating)) return setError('Completa el título, la descripción, la categoría y el estado físico para continuar.');
    if(selectedCategory==='Otros' && !otherCategory.trim()) return setError('Indica la categoría del artículo en Otros.');
    const images = values.images;
    if (images.length > 7) return setError('Agrega como máximo 7 fotos.');
    if(label==='Continuar publicación' && images.length===0) return setError('Agrega al menos una foto para continuar.');
    const provenance = values.provenance_evidence_ref?.trim() || null;
    if(label==='Continuar publicación'&&exposure>=1000&&!provenance)return setError('Adjunta una foto o PDF de la boleta para acreditar la procedencia.');
    const price = loan ? '0' : values.price === '' || values.price == null ? null : String(values.price);
    const guarantee = sale ? '0' : values.guarantee_amount === '' || values.guarantee_amount == null ? '0' : String(values.guarantee_amount);
    if ([price, guarantee].some(value => value != null && (!/^\d+(?:\.\d{1,2})?$/.test(value) || Number(value) > 99999999.99))) return setError('Usa montos positivos o cero, con hasta dos decimales.');
    if(label==='Continuar publicación' && !loan && (price==null||Number(price)<=0)) return setError('Indica un precio mayor que cero para continuar.');
    const from = sale ? null : values.available_from || null;
    const until = sale ? null : values.available_until || null;
    if ((!from&&until)||(values.modality!=='Alquiler'&&Boolean(from)!==Boolean(until))||
      (from&&until&&new Date(from)>=new Date(until)))return setError('Indica un inicio válido y, si pones fecha de fin, debe ser posterior.');
    if(label==='Continuar publicación' && !sale && !from) return setError('Indica las fechas de disponibilidad para continuar.');
    await onSave({ title: values.title.trim(), description: values.description.trim(), category:selectedCategory,category_other:selectedCategory==='Otros'?otherCategory.trim():null, condition:rating?physicalConditions[rating-1]:values.condition.trim(),condition_rating:rating||null, modality: values.modality,rental_unit:values.modality==='Alquiler'?values.rental_unit:'day', price, guarantee_amount: guarantee, available_from: from, available_until: until, images, provenance_evidence_ref: provenance });
  }
  return <form onSubmit={save} noValidate>
    <fieldset disabled={busy}>
      <label>Título<input value={values.title} maxLength={255} onChange={e => change('title', e.target.value)} /></label>
      <PublicationPhotos images={values.images} onChange={images => change('images', images)} disabled={busy||uploading} onProcessing={value => { setUploading(value); if (value) onDirty(); }} />
      <label>Descripción<textarea value={values.description} maxLength={MAX_DESCRIPTION_CHARACTERS} aria-describedby="description-character-count" aria-invalid={characters>MAX_DESCRIPTION_CHARACTERS} onChange={e => change('description', e.target.value)} /></label>
      <p id="description-character-count" className={characters>MAX_DESCRIPTION_CHARACTERS?'description-count description-count-error':'description-count'}>{characters}/{MAX_DESCRIPTION_CHARACTERS} caracteres. Incluye espacios y saltos de línea.</p>
      <label>Categoría<select value={selectedCategory} onChange={e=>{setSelectedCategory(e.target.value);onDirty();}}><option value="">Selecciona una categoría</option>{publicationCategories.map(category=><option key={category}>{category}</option>)}</select></label>
      {selectedCategory==='Otros' && <label>¿Qué tipo de artículo es?<input value={otherCategory} maxLength={100} onChange={e=>{setOtherCategory(e.target.value);onDirty();}} /></label>}
      <fieldset className="physical-rating"><legend>Estado físico</legend><div className="physical-stars">{physicalConditions.map((condition,index)=><button type="button" key={condition} aria-label={`${index+1} ${index===0?'estrella':'estrellas'}: ${condition}`} aria-pressed={rating===index+1} onClick={()=>{setRating(index+1);onDirty();}}><Star size={30} fill={index<rating?'currentColor':'none'} aria-hidden="true"/></button>)}</div><p>{rating?`${rating}/5 · ${physicalConditions[rating-1]}`:initial.condition?`Estado anterior: ${initial.condition}. Selecciona de 1 a 5 estrellas.`:'Selecciona de 1 a 5 estrellas según el estado real del artículo.'}</p></fieldset>
      <label>Modalidad<select value={values.modality} onChange={e=>{change('modality',e.target.value);toast?.showInfoToast?.(modalityAdvice[e.target.value]);}}><option>Venta</option><option>Alquiler</option><option>Préstamo</option></select></label>
      {!loan && <label>Precio (S/)<input type="number" min="0.01" max="99999999.99" step="0.01" value={values.price ?? ''} onChange={e => change('price', e.target.value)} /></label>}
      {values.modality==='Alquiler' && <label>¿Cada cuánto se cobra este precio?<select value={values.rental_unit} onChange={e=>change('rental_unit',e.target.value)}>{Object.entries(rentalUnits).map(([key,name])=><option key={key} value={key}>Por {name}</option>)}</select></label>}
      {sale && <p>Ingresa el precio bruto de venta. La tarifa total de servicio es 10% para precios menores de S/60 y 5% desde S/60. En el siguiente paso verás el monto neto estimado; no se descuenta IGV adicional a esa tarifa.</p>}
      {values.modality==='Alquiler' && <p>Tarifa: S/ {Number(values.price||0).toFixed(2)} por {rentalUnitLabel(values.rental_unit)} de uso. La garantía es un respaldo acordado ante daños o pérdida; no es parte de tu ganancia ni se cobra automáticamente por cualquier desperfecto. El precio indicado no es el total de toda la disponibilidad.</p>}
      {loan && <p className="loan-community">Presta para que el conocimiento siga creciendo. Compartes tu artículo sin cobrar por su uso y ayudas a otro miembro de la comunidad a alcanzar sus metas. Puedes acordar una garantía para cuidar lo que compartes.</p>}
      {!sale && <>
        <label>Garantía (S/)<input type="number" min="0" max="99999999.99" step="0.01" value={values.guarantee_amount ?? ''} onChange={e => change('guarantee_amount', e.target.value)} /></label>
        <label>Disponible desde<input type="date" value={values.available_from?.slice(0, 10) || ''} onChange={e => change('available_from', e.target.value)} /></label>
        <label>Disponible hasta<input type="date" aria-describedby={values.modality==='Alquiler'?'rental-end-optional':undefined} value={values.available_until?.slice(0, 10) || ''} onChange={e => change('available_until', e.target.value)} /></label>
        {values.modality==='Alquiler'&&<p id="rental-end-optional">Fecha de fin opcional: no es necesario completarla. Si la dejas vacía, tu artículo estará disponible desde la fecha de inicio, sin fecha límite. Quien lo solicite elegirá los días u horas que necesita.</p>}
        <p>Las fechas nuevas se interpretan a medianoche de Perú. La garantía declarada no implica cobro ni custodia.</p>
      </>}
      <p>El mayor valor entre precio y garantía determina el riesgo: desde S/500 se requiere revisión; desde S/1000 también evidencia de procedencia. El servidor decide el nivel y estado finales.</p>
      {(exposure >= 1000 || values.provenance_evidence_ref) && <ProvenanceUpload value={values.provenance_evidence_ref} onChange={ref=>change('provenance_evidence_ref',ref)} disabled={busy||uploading} onProcessing={value=>{setUploading(value);if(value)onDirty();}}/>}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy || uploading || characters>MAX_DESCRIPTION_CHARACTERS}>{uploading ? 'Subiendo fotos…' : busy ? 'Guardando…' : label}</button>
    </fieldset>
  </form>;
}
