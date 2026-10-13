import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AppToast from './AppToast';
import { useToast } from '../../lib/toast-context';

function Trigger() {
  const { showSuccessToast,showInfoToast } = useToast();
  return <><button onClick={() => showSuccessToast('Cambios guardados.')}>Mostrar aviso</button><button onClick={()=>showInfoToast('Conserva tus acuerdos en Ranti.')}>Mostrar consejo</button></>;
}

afterEach(() => vi.useRealTimers());

it('keeps a new confirmation visible for six seconds and restarts its timer', () => {
  vi.useFakeTimers();
  render(<AppToast><Trigger /></AppToast>);
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar aviso' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('status')).toHaveTextContent('Cambios guardados.');
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar aviso' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('status')).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('shows a dismissible advice toast without labeling it as a successful action',()=>{
  render(<AppToast><Trigger/></AppToast>);
  fireEvent.click(screen.getByRole('button',{name:'Mostrar consejo'}));
  expect(screen.getByRole('status')).toHaveTextContent('Un consejo de Ranti');
  expect(screen.getByRole('status')).not.toHaveTextContent('¡Listo!');
  fireEvent.click(screen.getByRole('button',{name:'Cerrar consejo'}));expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
