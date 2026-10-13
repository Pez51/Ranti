import { ChevronLeft, ChevronRight, Expand, PackageSearch, Pause, Play, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { publicationImageUrl } from '../../lib/api';
import './publication-gallery.css';

function Photo({ src, alt }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span className="publication-gallery-missing"><PackageSearch aria-hidden="true" size={48} />Imagen no disponible</span> :
    <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

export default function PublicationGallery({ images = [], title, modality }) {
  const photos = images.map(image => ({
    src: publicationImageUrl(typeof image === 'string' ? image : image.image_url),
    primary: Boolean(image.is_primary),
  })).filter(image => image.src);
  const [index, setIndex] = useState(() => Math.max(0, photos.findIndex(photo => photo.primary)));
  const current = index % (photos.length || 1);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const dialog = useRef(null);
  const opener = useRef(null);
  const multiple = photos.length > 1;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = event => setReducedMotion(event.matches);
    const visibility = () => setVisible(!document.hidden);
    media?.addEventListener('change', change);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      media?.removeEventListener('change', change);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);

  useEffect(() => {
    if (!multiple || paused || hovered || focused || expanded || !visible || reducedMotion) return;
    const timer = window.setInterval(() => setIndex(previous => (previous + 1) % photos.length), 5000);
    return () => window.clearInterval(timer);
  }, [multiple, photos.length, paused, hovered, focused, expanded, visible, reducedMotion]);

  useEffect(() => {
    if (!expanded) return;
    const element = dialog.current;
    const trigger = opener.current;
    element.showModal();
    return () => { element.close(); trigger?.focus(); };
  }, [expanded]);

  function move(direction) { setIndex(previous => (previous + direction + photos.length) % photos.length); }
  function keyboard(event) {
    if (!multiple) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }
  function arrows() {
    return multiple && <>
      <button type="button" className="publication-gallery-arrow is-previous" aria-label="Foto anterior" onClick={() => move(-1)}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="publication-gallery-arrow is-next" aria-label="Foto siguiente" onClick={() => move(1)}><ChevronRight aria-hidden="true" /></button>
    </>;
  }

  return <section className="publication-gallery" aria-label="Fotos del artículo"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocus={() => setFocused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    onKeyDown={keyboard}>
    <div className="publication-gallery-stage">
      <span className="publication-gallery-modality">{modality}</span>
      {photos.length ? <button ref={opener} type="button" className="publication-gallery-open" aria-label={`Ampliar foto ${current + 1} de ${photos.length}`} onClick={() => setExpanded(true)}>
        <Photo key={photos[current].src} src={photos[current].src} alt={`${title} — foto ${current + 1}`} />
        <span className="publication-gallery-hint"><Expand size={16} aria-hidden="true" /> Ver foto completa</span>
      </button> : <span className="publication-gallery-missing"><PackageSearch aria-hidden="true" size={64} />Sin fotos</span>}
      {arrows()}
      {multiple && <span className="publication-gallery-count">{current + 1} / {photos.length}</span>}
    </div>
    {multiple && <>
      <div className="publication-gallery-thumbnails" aria-label="Seleccionar foto">
        {photos.map((photo, position) => <button type="button" key={`${photo.src}-${position}`} aria-label={`Ver foto ${position + 1}`} aria-pressed={position === current} onClick={() => setIndex(position)}>
          <Photo key={photo.src} src={photo.src} alt={`Miniatura ${position + 1}`} />
        </button>)}
      </div>
      <div className="publication-gallery-toolbar">
        <span>{reducedMotion ? 'Cambio automático desactivado por tu preferencia de movimiento.' : 'Las fotos cambian cada 5 segundos; se pausan al interactuar.'}</span>
        {!reducedMotion && <button type="button" onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}{paused ? 'Reanudar' : 'Pausar'}</button>}
      </div>
    </>}
    {expanded && <dialog ref={dialog} className="publication-gallery-dialog" aria-label={`Fotos de ${title}`} onCancel={() => setExpanded(false)} onClick={event => { if (event.target === event.currentTarget) setExpanded(false); }}>
      <div className="publication-gallery-viewer">
        <button type="button" autoFocus className="publication-gallery-close" aria-label="Cerrar visor" onClick={() => setExpanded(false)}><X aria-hidden="true" /></button>
        <Photo key={photos[current].src} src={photos[current].src} alt={`${title} — foto ampliada ${current + 1}`} />
        {arrows()}
        <span className="publication-gallery-count">{current + 1} / {photos.length}</span>
      </div>
      <p>{title} · Foto {current + 1} de {photos.length}{multiple ? ' · Usa las flechas para cambiar de foto.' : ''}</p>
    </dialog>}
  </section>;
}
