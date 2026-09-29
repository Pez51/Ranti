import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import RequireSession from './RequireSession';

const SESSION_KEY = 'ranti-session';

function LocationProbe() {
  const location = useLocation();
  const from = location.state?.from;

  return (
    <>
      <output data-testid="current-path">{location.pathname}{location.search}{location.hash}</output>
      <output data-testid="requested-path">{from ? `${from.pathname}${from.search}${from.hash}` : ''}</output>
    </>
  );
}

function renderProtectedRoute(initialPath, routePath, allowedRoles = null) {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <LocationProbe />
      <Routes>
        <Route path="/" element={<p>Home page</p>} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route
          path={routePath}
          element={
            <RequireSession allowedRoles={allowedRoles}>
              <p>Protected page</p>
            </RequireSession>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireSession', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('redirects an anonymous visitor to /login and preserves the requested path', () => {
    renderProtectedRoute('/checkout/42?step=payment#details', '/checkout/:id');

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.getByTestId('requested-path')).toHaveTextContent('/checkout/42?step=payment#details');
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });

  it('renders a protected page for a stored session', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', user: { role: 'Demandante' } }));

    renderProtectedRoute('/perfil', '/perfil');

    expect(screen.getByText('Protected page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/perfil');
  });

  it('redirects a non-administrator away from an administrator route', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', user: { role: 'Demandante' } }));

    renderProtectedRoute('/admin', '/admin', ['Administrador']);

    expect(screen.getByText('Home page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/');
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });

  it('renders an administrator route for role Administrador', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', user: { role: 'Administrador' } }));

    renderProtectedRoute('/admin', '/admin', ['Administrador']);

    expect(screen.getByText('Protected page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/admin');
  });

  it('treats malformed session JSON as logged out', () => {
    localStorage.setItem(SESSION_KEY, '{broken json');

    renderProtectedRoute('/publicar', '/publicar');

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.getByTestId('requested-path')).toHaveTextContent('/publicar');
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('redirects when a session is removed in another tab', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', user: { role: 'Demandante' } }));
    renderProtectedRoute('/perfil', '/perfil');

    expect(screen.getByText('Protected page')).toBeInTheDocument();

    act(() => {
      localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: SESSION_KEY, oldValue: 'stored-session', newValue: null }));
    });

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.getByTestId('requested-path')).toHaveTextContent('/perfil');
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });

  it('redirects when the current tab clears its session', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'stored-token', user: { role: 'Demandante' } }));
    renderProtectedRoute('/perfil', '/perfil');

    expect(screen.getByText('Protected page')).toBeInTheDocument();

    act(() => {
      sessionStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new Event('ranti-auth-changed'));
    });

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/login');
    expect(screen.queryByText('Protected page')).not.toBeInTheDocument();
  });
});
