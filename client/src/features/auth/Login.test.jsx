import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from './Login';
import { apiRequest } from '../../lib/api';
import { getSession } from '../../lib/auth';
import { change, click, user } from '../../test/workflows';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear(); });
it.each(['/publicar', '//evil.org', '/\\evil.org'])('uses a safe protected redirect for %s', async from => {
  apiRequest.mockResolvedValue({ token: 'login-token', user });
  render(<MemoryRouter initialEntries={[{ pathname: '/login', state: { from: { pathname: from } } }]}><Routes><Route path="/login" element={<Login />} /><Route path="/publicar" element={<p>Publicar destino</p>} /><Route path="/perfil" element={<p>Perfil destino</p>} /></Routes></MemoryRouter>);
  change('Correo Institucional', 'ana@ucsm.edu.pe'); change('Contraseña', 'secret'); click('Iniciar Sesión');
  expect(await screen.findByText(from === '/publicar' ? 'Publicar destino' : 'Perfil destino')).toBeInTheDocument(); expect(getSession()?.token).toBe('login-token');
});
it('does not save a malformed login response as a session', async () => {
  apiRequest.mockResolvedValue({ user }); render(<MemoryRouter><Login /></MemoryRouter>);
  change('Correo Institucional', 'ana@ucsm.edu.pe'); change('Contraseña', 'secret'); click('Iniciar Sesión');
  expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(getSession()).toBeNull();
});
