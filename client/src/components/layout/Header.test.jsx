import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Header from './Header';
import { apiRequest } from '../../lib/api';
import { getSession, saveSession, updateSessionProfile } from '../../lib/auth';

vi.mock('../../lib/api', async importOriginal => ({ ...(await importOriginal()), apiRequest: vi.fn() }));
vi.mock('./NotificationDrawer', () => ({ default: () => null }));

const id = '11111111-1111-4111-8111-111111111111';
const photo = `/api/users/photos/${id}/22222222-2222-4222-8222-222222222222`;
const user = { id, email: 'prueba@ucsm.edu.pe', role: 'Egresado' };
const profile = { ...user, display_name: 'Usuario de prueba', avatar_url: photo };
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); vi.resetAllMocks();
  saveSession({ token: 'test-token', user }, false);
  apiRequest.mockResolvedValue(profile);
});
function setup() { render(<MemoryRouter><Header /></MemoryRouter>); }

it('loads the saved photo in the header and left drawer, and refreshes both after a profile save', async () => {
  setup();
  expect(await screen.findByAltText('Foto de perfil')).toHaveAttribute('src', `http://localhost:3000${photo}`);
  fireEvent.click(screen.getByRole('button', { name: /MENÚ/ }));
  expect(screen.getAllByAltText('Foto de perfil')).toHaveLength(2);
  const replacement = `/api/users/photos/${id}/33333333-3333-4333-8333-333333333333`;
  act(() => updateSessionProfile({ ...profile, avatar_url: replacement }, 'test-token'));
  for (const image of screen.getAllByAltText('Foto de perfil')) {
    expect(image).toHaveAttribute('src', `http://localhost:3000${replacement}`);
  }
  expect(localStorage.getItem('ranti-session')).toBeNull();
  expect(getSession().user.avatar_url).toBe(replacement);
});

it('opens account options from the header photo and supports keyboard dismissal and logout', async () => {
  setup();
  await screen.findByAltText('Foto de perfil');
  const trigger = screen.getByRole('button', { name: 'Opciones de mi cuenta' });
  fireEvent.click(trigger);
  const menu = screen.getByRole('menu', { name: 'Mi cuenta' });
  expect(within(menu).getByRole('menuitem', { name: 'Mi perfil' })).toHaveAttribute('href', '/perfil');
  expect(within(menu).getByRole('menuitem', { name: 'Mis operaciones' })).toHaveAttribute('href', '/operaciones');
  expect(within(menu).queryByRole('menuitem', { name: 'Panel de administración' })).not.toBeInTheDocument();
  expect(within(menu).getByRole('menuitem', { name: 'Mi perfil' })).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'ArrowDown' });
  expect(within(menu).getByRole('menuitem', { name: 'Mis operaciones' })).toHaveFocus();
  fireEvent.keyDown(menu, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
  expect(getSession()).toBeNull();
  expect(screen.queryByAltText('Foto de perfil')).not.toBeInTheDocument();
});

it('opens options from the left avatar without a photo and closes the drawer when navigating', async () => {
  apiRequest.mockResolvedValue({ ...profile, avatar_url: null });
  setup();
  await waitFor(() => expect(getSession().user.avatar_url).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: /MENÚ/ }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Opciones de mi cuenta' })[1]);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mi perfil' }));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Opciones de mi cuenta' })).toHaveLength(1);
  expect(screen.queryByAltText('Foto de perfil')).not.toBeInTheDocument();
});

it('does not let an old initial request overwrite a newer saved photo', async () => {
  let resolve;
  apiRequest.mockReturnValue(new Promise(done => { resolve = done; }));
  setup();
  act(() => updateSessionProfile(profile, 'test-token'));
  await act(async () => resolve({ ...profile, avatar_url: null }));
  expect(screen.getByAltText('Foto de perfil')).toHaveAttribute('src', `http://localhost:3000${photo}`);
});

it('ignores an update belonging to a different or signed-out session', () => {
  updateSessionProfile({ ...profile, id: 'another-user' }, 'test-token');
  expect(getSession().user.avatar_url).toBeUndefined();
  updateSessionProfile(profile, 'old-token');
  expect(getSession().user.avatar_url).toBeUndefined();
  sessionStorage.clear();
  updateSessionProfile(profile, 'test-token');
  expect(getSession()).toBeNull();
});

it('offers administrator options and closes the popup on an outside click', async () => {
  saveSession({ token: 'test-token', user: { ...user, role: 'Administrador' } }, true);
  setup();
  await screen.findByAltText('Foto de perfil');
  fireEvent.click(screen.getByRole('button', { name: 'Opciones de mi cuenta' }));
  expect(screen.getByRole('menuitem', { name: 'Panel de administración' })).toHaveAttribute('href', '/admin');
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('ranti-session')).toBeNull();
  expect(JSON.parse(localStorage.getItem('ranti-session')).user.avatar_url).toBe(photo);
});

it('uses the fallback icon for a broken photo and retries when a new photo is saved', async () => {
  setup();
  fireEvent.error(await screen.findByAltText('Foto de perfil'));
  expect(screen.queryByAltText('Foto de perfil')).not.toBeInTheDocument();
  const replacement = `/api/users/photos/${id}/44444444-4444-4444-8444-444444444444`;
  act(() => updateSessionProfile({ ...profile, avatar_url: replacement }, 'test-token'));
  expect(screen.getByAltText('Foto de perfil')).toHaveAttribute('src', `http://localhost:3000${replacement}`);
});
