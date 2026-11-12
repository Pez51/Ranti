import { useId, useState } from 'react';

const example = {
  name: 'LUIS PÉREZ',
  number: '4242 4242 4242 4242',
  expiry: '12/28',
  cvv: '123',
  email: 'luis@example.com',
};
const empty = { name: '', number: '', expiry: '', cvv: '', email: '' };

export default function DemoCardFields({ onValidity }) {
  const [card, setCard] = useState(empty);
  const id = useId();

  function update(next) {
    setCard(next);
    const [month, year] = next.expiry.split('/').map(Number);
    const now = new Date();
    const expires = /^\d{2}\/\d{2}$/.test(next.expiry) && month >= 1 && month <= 12 &&
      2000 + year >= now.getFullYear() && (2000 + year > now.getFullYear() || month > now.getMonth());
    onValidity(next.name.trim().length >= 3 && next.number.replaceAll(' ', '') === '4242424242424242' &&
      expires && next.cvv === '123' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email));
  }

  return <fieldset className="ranti-payment-fields">
    <legend>Datos de la tarjeta de prueba</legend>
    <p id={id}>Usa el número 4242 4242 4242 4242, una fecha vigente y el CVV 123. Estos campos se validan en esta pantalla.</p>
    <button type="button" onClick={() => update(example)}>Completar con datos de prueba</button>
    <label>Nombre del titular<input autoComplete="off" required maxLength={100} value={card.name}
      onChange={event => update({ ...card, name: event.target.value })} /></label>
    <label>Número de tarjeta<input autoComplete="off" inputMode="numeric" required maxLength={19}
      aria-describedby={id} value={card.number} onChange={event => update({ ...card, number: event.target.value })} /></label>
    <label>Vencimiento (MM/AA)<input autoComplete="off" inputMode="numeric" required maxLength={5}
      value={card.expiry} onChange={event => update({ ...card, expiry: event.target.value })} /></label>
    <label>CVV<input type="password" autoComplete="off" inputMode="numeric" required maxLength={3}
      value={card.cvv} onChange={event => update({ ...card, cvv: event.target.value })} /></label>
    <label>Correo de confirmación<input type="email" autoComplete="off" required maxLength={254}
      value={card.email} onChange={event => update({ ...card, email: event.target.value })} /></label>
  </fieldset>;
}
