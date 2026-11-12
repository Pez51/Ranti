import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import ReturnPanel from './ReturnPanel';
import { apiRequest } from '../../lib/api';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn(), apiBlob: vi.fn() }));

const rental = {
  id: 'return-operation', status: 'Entregada/Activa', modality: 'Alquiler', end_date: '2026-10-30T15:00:00Z',
  handoff: { revision: 4, otp_required: true, delivered: true, is_owner: false },
};

it('records an explicitly confirmed physical return with structured Peru-local details', async () => {
  apiRequest.mockResolvedValue({ evidence: [] });
  const onAction = vi.fn();
  render(<ReturnPanel operation={rental} onAction={onAction} />);
  await screen.findByLabelText('Fotos de la devolución');
  fireEvent.change(screen.getByLabelText('Fecha y hora real de devolución (Perú)'), { target: { value: '2026-10-29T10:30' } });
  fireEvent.change(screen.getByLabelText('Punto de devolución'), { target: { value: 'Biblioteca UCSM' } });
  fireEvent.change(screen.getByLabelText('Estado y observaciones'), { target: { value: 'Equipo intacto, incluye cable.' } });
  fireEvent.change(screen.getByLabelText('Estado de los accesorios'), { target: { value: 'true' } });
  const submit = screen.getByRole('button', { name: 'Registrar devolución' });
  expect(submit).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo la devolución física/ }));
  fireEvent.click(submit);
  expect(onAction).toHaveBeenCalledWith({
    action: 'record-return', revision: 4, returned_at: '2026-10-29T15:30:00.000Z',
    return_location: 'Biblioteca UCSM', notes: 'Equipo intacto, incluye cable.', accessories_confirmed: true,
  });
});

it('requires inspection evidence before asking to apply guarantee', async () => {
  apiRequest.mockResolvedValue({ evidence: [] });
  const onAction = vi.fn();
  render(<ReturnPanel onAction={onAction} operation={{
    ...rental, handoff: { ...rental.handoff, is_owner: true },
    return_settlement: { return_notes: 'Se entregó en la biblioteca.', held: '200.00' },
  }} />);
  await screen.findByLabelText('Fotos de la inspección');
  fireEvent.change(screen.getByLabelText('Fecha y hora real de recepción (Perú)'), { target: { value: '2026-10-29T10:30' } });
  fireEvent.change(screen.getByLabelText('Resultado de inspección'), { target: { value: 'danos' } });
  fireEvent.change(screen.getByLabelText('Motivo y observaciones de la inspección'), { target: { value: 'Daño en el cable.' } });
  fireEvent.change(screen.getByLabelText('Estado de los accesorios'), { target: { value: 'true' } });
  fireEvent.change(screen.getByLabelText('Importe reclamado de garantía (S/)'), { target: { value: '80.00' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que recibí el equipo/ }));
  expect(screen.getByRole('button', { name: 'Solicitar S/ 80.00 de garantía' })).toBeDisabled();
  expect(onAction).not.toHaveBeenCalled();
});

it('requires express agreement to the exact approved split before closing the return', async () => {
  apiRequest.mockResolvedValue({ evidence: [] });
  const onAction = vi.fn();
  render(<ReturnPanel operation={{ ...rental, return_settlement: {
    held: '200.00', return_notes: 'Equipo devuelto.', inspection_notes: 'Daño en el cable.',
    proposed: { guarantee: '200.00', owner: '80.00', buyer: '120.00', excess: '0.00' },
  } }} onAction={onAction} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aceptar el importe de S/ 80.00' }));
  const confirm = screen.getByRole('button', { name: 'Confirmar acuerdo sobre la garantía' });
  expect(confirm).toBeDisabled();
  expect(screen.getByText(/S\/ 80.00 al oferente y S\/ 120.00 al comprador/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /Acepto el importe de S\/ 80.00/ }));
  fireEvent.click(confirm);
  expect(onAction).toHaveBeenCalledWith({ action: 'accept-inspection', revision: 4 });
});
