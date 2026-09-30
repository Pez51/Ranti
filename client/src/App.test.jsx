import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';
import { apiRequest } from './lib/api';
import { session } from './test/workflows';
vi.mock('./lib/api', () => ({ apiRequest: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); session(); apiRequest.mockResolvedValue([]); });
it('routes the existing provider navigation to real own publications instead of sample metrics', async () => {
  window.history.replaceState({}, '', '/oferente'); render(<App />);
  expect(await screen.findByText('Todavía no tienes publicaciones.')).toBeInTheDocument();
  expect(screen.queryByText('#OP-9982')).not.toBeInTheDocument();
});
it('makes registration reachable without a session', () => {
  sessionStorage.clear(); window.history.replaceState({}, '', '/registro'); render(<App />);
  expect(screen.getByRole('heading', { name: 'Crear cuenta UCSM' })).toBeInTheDocument();
});
