import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminDashboard from './AdminDashboard';
import { apiRequest } from '../../lib/api';
import { change, click, session, publication } from '../../test/workflows';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
const review = { ...publication, status: 'Pendiente de revisión', submitted_at: '2026-09-30T12:00:00.123Z', provenance_evidence_ref: 'https://example.org/provenance' };
beforeEach(() => { vi.resetAllMocks(); session('Administrador'); });
function setup() { apiRequest.mockResolvedValue({ items: [review], limit: 20, offset: 0 }); render(<AdminDashboard />); }
it('denies a non-admin without querying either sensitive queue', () => {
  session(); render(<AdminDashboard />); expect(screen.getByRole('alert')).toHaveTextContent(/Administrador/); expect(apiRequest).not.toHaveBeenCalled();
});
it('renders an honest empty publication queue without a role-review queue', async () => {
  apiRequest.mockResolvedValue({ items: [], limit: 20, offset: 0 }); render(<AdminDashboard />);
  expect(await screen.findByText('No hay publicaciones pendientes.')).toBeInTheDocument();
  expect(screen.queryByText('Solicitudes de rol')).not.toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalledWith(expect.stringContaining('/admin/role-requests'), expect.anything());
});
it('opens administrative chat review on demand without fetching chat content in advance',async()=>{
  apiRequest.mockResolvedValueOnce({items:[],limit:20,offset:0});render(<AdminDashboard/>);
  await screen.findByText('No hay publicaciones pendientes.');
  expect(apiRequest).toHaveBeenCalledTimes(1);
  apiRequest.mockResolvedValueOnce({items:[],has_more:false});
  fireEvent.click(screen.getByRole('button',{name:'Ver todos los chats'}));
  expect(await screen.findByText('No hay conversaciones.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cerrar revisión de chats'}));
  expect(screen.queryByRole('region',{name:'Revisión administrativa de chats'})).not.toBeInTheDocument();
});
it('unmounts administrative chat content when the session ends',async()=>{
  apiRequest.mockResolvedValueOnce({items:[],limit:20,offset:0});render(<AdminDashboard/>);
  await screen.findByText('No hay publicaciones pendientes.');
  apiRequest.mockResolvedValueOnce({items:[],has_more:false});fireEvent.click(screen.getByRole('button',{name:'Ver todos los chats'}));
  await screen.findByText('No hay conversaciones.');
  act(()=>{sessionStorage.clear();localStorage.clear();window.dispatchEvent(new Event('ranti-auth-changed'));});
  expect(screen.queryByRole('region',{name:'Revisión administrativa de chats'})).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/Solo un Administrador/);
});
it('requires review reasons, sends exact cycle token, and renders the server decision', async () => {
  setup(); const region = await screen.findByRole('region', { name: 'Publicación: Calculadora' });
  expect(within(region).getByRole('link', { name: 'Ver evidencia de procedencia' })).toHaveAttribute('href', review.provenance_evidence_ref);
  expect(within(region).getByRole('button', { name: 'Aprobar' })).toBeDisabled(); change('Motivo publicación pub-1', 'Comprobado');
  apiRequest.mockResolvedValueOnce({ ...review, status: 'Activa', review_reason: 'Comprobado' }); within(region).getByRole('button', { name: 'Aprobar' }).click();
  await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/admin/publications/pub-1/review', expect.objectContaining({ body: JSON.stringify({ decision: 'approve', reason: 'Comprobado', submittedAt: '2026-09-30T12:00:00.123Z' }) })));
  expect(await screen.findByText(/Decisión confirmada: Activa/)).toBeInTheDocument();
});
it('preserves stale/conflicting decisions as errors and offers queue refresh', async () => {
  setup(); await screen.findByText('Calculadora'); change('Motivo publicación pub-1', 'Revisado'); apiRequest.mockRejectedValueOnce(Object.assign(new Error('El estado actual impide esta acción.'), { status: 409 }));
  const region = screen.getByRole('region', { name: 'Publicación: Calculadora' }); within(region).getByRole('button', { name: 'Aprobar' }).click();
  expect(await screen.findByRole('alert')).toHaveTextContent(/El estado actual.*Actualiza/i); expect(screen.getByRole('button', { name: 'Actualizar colas' })).toBeEnabled();
});
it('shows a fetch error and permits retry without leaking old queues', async () => {
  apiRequest.mockRejectedValue(new Error('Acceso denegado.')); render(<AdminDashboard />); expect(screen.getByRole('status')).toHaveTextContent(/Cargando/);
  expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado.'); apiRequest.mockResolvedValue({ items: [], limit: 20, offset: 0 }); click('Actualizar colas'); expect(await screen.findByText('No hay publicaciones pendientes.')).toBeInTheDocument();
});
it('prevents queue refresh from racing an in-flight decision', async () => {
  setup(); const region = await screen.findByRole('region', { name: 'Publicación: Calculadora' }); change('Motivo publicación pub-1', 'Comprobado');
  let resolve; apiRequest.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(within(region).getByRole('button', { name: 'Aprobar' }));
  expect(screen.getByRole('button', { name: 'Actualizar colas' })).toBeDisabled();
  await act(async () => resolve({ ...review, status: 'Activa', review_reason: 'Comprobado' }));
  expect(screen.getByRole('button', { name: 'Actualizar colas' })).toBeEnabled();
  expect(screen.getByText(/Decisión confirmada: Activa/)).toBeInTheDocument();
});
