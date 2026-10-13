import { useRef, useState } from 'react';

const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export default function AcademicCombobox({ id, label, text, selected, options, disabled = false,
  required = false, onInput, onSelect, onDismiss }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const matches = open && selected && text === selected
    ? options
    : options.filter(option => normalize(option).includes(normalize(text)));

  function choose(option) {
    onSelect(option);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(index => event.key === 'ArrowDown'
        ? Math.min(index + 1, matches.length - 1)
        : index <= 0 ? matches.length - 1 : index - 1);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (matches.length) choose(matches[Math.max(activeIndex, 0)]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      onDismiss();
    }
  }

  return <div className="academic-combobox">
    <label htmlFor={id}>{label}</label>
    <input id={id} ref={inputRef} type="search" role="combobox" autoComplete="off"
      aria-autocomplete="list" aria-expanded={open && !disabled}
      aria-controls={`${id}-options`}
      aria-activedescendant={open && activeIndex >= 0 && matches[activeIndex]
        ? `${id}-option-${options.indexOf(matches[activeIndex])}` : undefined}
      placeholder={disabled ? 'Selecciona primero una facultad' : `Selecciona o busca ${label.toLowerCase()}`}
      value={text} required={required} disabled={disabled}
      onFocus={() => { setOpen(true); setActiveIndex(-1); }}
      onChange={event => { onInput(event.target.value); setOpen(true); setActiveIndex(-1); }}
      onKeyDown={handleKeyDown}
      onBlur={() => { setOpen(false); setActiveIndex(-1); onDismiss(); }} />
    {open && !disabled && <div id={`${id}-options`} role="listbox" aria-label={label}
      className="academic-options">
      {matches.length ? matches.map((option, index) =>
        <button key={option} id={`${id}-option-${options.indexOf(option)}`} type="button" role="option"
          aria-selected={option === selected} className="academic-option"
          data-active={index === activeIndex}
          onMouseDown={event => event.preventDefault()}
          onClick={() => choose(option)}>{option}</button>)
        : <p className="academic-no-results">Sin coincidencias</p>}
    </div>}
  </div>;
}
