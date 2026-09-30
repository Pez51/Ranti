import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserProfile from './UserProfile';
import { apiRequest } from '../../lib/api';
import { change, click, session, profile, roleRequest } from '../../test/workflows';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); session(); });
function setup(history = [], data = profile) { apiRequest.mockImplementation(path => Promise.resolve(path === '/users/me' ? data : history)); render(<MemoryRouter><UserProfile /></MemoryRouter>); }
it('renders actual protected metrics and only patches editable fields, including optional clearing', async () => {
  setup(); expect(await screen.findByText('4.20')).toBeInTheDocument(); expect(screen.getByText('7')).toBeInTheDocument(); expect(screen.getByText(profile.email)).toBeInTheDocument();
  change('Nombre visible', 'Ana María'); change('Avatar (URL HTTPS)', ''); change('Facultad', ''); click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ display_name: 'Ana María', avatar_url: null, faculty: null }) })));
  expect(await screen.findByRole('status')).toHaveTextContent(/guardado/i);
});
it('submits real evidence and allowed metadata, renders history without exposing its private reference', async () => {
  setup(); await screen.findByLabelText('Nombre visible');
  change('Referencia de evidencia (HTTPS)', 'https://example.org/matricula'); change('Tipo de documento', 'Matrícula'); change('Institución', 'UCSM'); change('Periodo académico', '2026-II'); change('Nota', 'Vigente');
  apiRequest.mockResolvedValueOnce(roleRequest); click('Solicitar rol Estudiante');
  expect(await screen.findByText('Pendiente')).toBeInTheDocument(); expect(screen.queryByText(roleRequest.evidence_ref)).not.toBeInTheDocument();
  expect(apiRequest).toHaveBeenLastCalledWith('/users/me/role-requests', expect.objectContaining({ body: JSON.stringify({ evidence_ref: 'https://example.org/matricula', evidence_metadata: { documentType: 'Matrícula', institution: 'UCSM', academicPeriod: '2026-II', note: 'Vigente' } }) }));
  expect(screen.queryByRole('button', { name: 'Solicitar rol Estudiante' })).not.toBeInTheDocument();
});
it('prevents current students requesting again and displays rejected and approved history reasons', async () => {
  setup([{ ...roleRequest, status: 'rejected', review_reason: 'Documento vencido' }, { ...roleRequest, id: 'role-2', status: 'approved', review_reason: 'Vigencia confirmada' }], { ...profile, role: 'Estudiante', academic_condition: 'Estudiante' });
  expect(await screen.findByText('Documento vencido')).toBeInTheDocument(); expect(screen.getByText('Aprobada')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Solicitar rol Estudiante' })).not.toBeInTheDocument();
});
it('shows loading and retry after profile load fails', async () => {
  apiRequest.mockRejectedValue(new Error('Sin conexión')); render(<MemoryRouter><UserProfile /></MemoryRouter>); expect(screen.getByRole('status')).toHaveTextContent(/Cargando/);
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión'); apiRequest.mockImplementation(path => Promise.resolve(path === '/users/me' ? profile : [])); click('Reintentar'); expect(await screen.findByLabelText('Nombre visible')).toHaveValue('Ana');
});
it('shows API validation failure without claiming the profile was saved', async () => {
  setup(); await screen.findByLabelText('Nombre visible'); apiRequest.mockRejectedValueOnce(new Error('Datos inválidos.')); click('Guardar perfil'); expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.');
});
it('requires a session without fetching private profile data', () => {
  sessionStorage.clear(); render(<MemoryRouter><UserProfile /></MemoryRouter>); expect(screen.getByRole('alert')).toHaveTextContent(/Inicia sesión/); expect(apiRequest).not.toHaveBeenCalled();
});
