import { useState } from 'react';

const samples = {
  banco_prueba: { holder: 'ANA LÓPEZ', account: '1234564321', cci: '00012345678901234321' },
  yape_prueba: { holder: 'ANA LÓPEZ', account: '900000101', cci: '' },
  plin_prueba: { holder: 'ANA LÓPEZ', account: '900000202', cci: '' },
};

export default function DemoPayoutFields({ channel, onVerify, busy }) {
  const [details, setDetails] = useState({ holder: '', account: '', cci: '' });
  const sample = samples[channel];
  const bank = channel === 'banco_prueba';
  const valid = details.holder.trim().length >= 3 && details.account === sample.account && details.cci === sample.cci;
  return <form onSubmit={event => { event.preventDefault(); if (valid) onVerify(); }}>
    <fieldset className="ranti-payment-fields" disabled={busy}>
      <legend>{bank ? 'Cuenta bancaria de prueba' : 'Billetera receptora de prueba'}</legend>
      <button type="button" onClick={() => setDetails(sample)}>Completar cuenta de ejemplo</button>
      <label>Titular<input autoComplete="off" required maxLength={100} value={details.holder}
        onChange={event => setDetails({ ...details, holder: event.target.value })} /></label>
      {bank && <p>Banco de ejemplo · Ahorros · PEN</p>}
      <label>{bank ? 'Número de cuenta' : 'Número de billetera'}<input autoComplete="off" inputMode="numeric" required
        maxLength={sample.account.length} value={details.account} onChange={event => setDetails({ ...details, account: event.target.value })} /></label>
      {bank && <label>CCI<input autoComplete="off" inputMode="numeric" required maxLength={20} value={details.cci}
        onChange={event => setDetails({ ...details, cci: event.target.value })} /></label>}
      <button disabled={!valid}>Verificar cuenta receptora de prueba</button>
    </fieldset>
  </form>;
}
