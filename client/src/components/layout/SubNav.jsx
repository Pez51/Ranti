import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { publicationCategories } from '../../lib/publication-options';
import './subnav.css';

const primary = ['Tecnología', 'Libros y apuntes', 'Laboratorio', 'Otros'];
const additional = publicationCategories.filter(category => !primary.includes(category));
export default function SubNav() {
  const [searchParams] = useSearchParams();
  const currentCategory = searchParams.get('category');
  const [open, setOpen] = useState(false);
  const container = useRef(null), trigger = useRef(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  function href(category) {
    const query = new URLSearchParams(searchParams);
    query.set('category', category);
    return `/?${query}`;
  }
  function categoryLink(category) {
    return <Link key={category} to={href(category)} aria-current={currentCategory === category ? 'page' : undefined} onClick={() => setOpen(false)}>{category}</Link>;
  }
  return <nav aria-label="Categorías del catálogo" className="category-nav">
    <div className="category-nav-inner">
      <div className="category-links">
        <Link to="/" aria-current={!currentCategory && !searchParams.get('q') ? 'page' : undefined}>Inicio</Link>
        {primary.map(categoryLink)}
      </div>
      <div ref={container} className="category-more" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
        <button ref={trigger} type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)} className={additional.includes(currentCategory) ? 'category-more-active' : ''}>
          {additional.includes(currentCategory) ? currentCategory : 'Más categorías'}<ChevronDown size={18} aria-hidden="true" className={open ? 'category-chevron-open' : ''}/>
        </button>
        {open && <ul id={panelId} className="category-dropdown" aria-label="Más categorías">{additional.map(category => <li key={category}>{categoryLink(category)}</li>)}</ul>}
      </div>
    </div>
  </nav>;
}
