import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AppToast from '../../components/layout/AppToast';
import UserProfile from './UserProfile';
import { apiRequest } from '../../lib/api';
import { preparePhoto } from '../../lib/prepare-photo';
import { change, click, session, profile } from '../../test/workflows';

vi.mock('../../lib/api', () => ({
  apiRequest: vi.fn(),
  apiAssetUrl: path => path?.startsWith('/api/users/photos/') ? `http://localhost:3000${path}` : null,
}));
vi.mock('../../lib/prepare-photo', () => ({ preparePhoto: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks(); session();
  preparePhoto.mockResolvedValue(new Blob(['converted-photo'], { type: 'image/webp' }));
});
const catalog = [
  { faculty: 'Ciencias e Ingenierías Físicas y Formales', careers: ['Ingeniería de Sistemas', 'Ingeniería Biomédica'] },
  { faculty: 'Ciencias Sociales y Humanidades', careers: ['Psicología'] },
];
function setup(data = { ...profile, avatar_url: null }) {
  apiRequest.mockImplementation(path => Promise.resolve(path === '/users/academic-catalog' ? catalog : data));
  render(<MemoryRouter initialEntries={['/perfil']}><AppToast><Routes>
    <Route path="/perfil" element={<UserProfile />} />
    <Route path="/" element={<h1>Página de inicio</h1>} />
  </Routes></AppToast></MemoryRouter>);
}

it('shows profile data and saves only selected academic options', async () => {
  setup();
  expect(await screen.findByText('4.20')).toBeInTheDocument();
  expect(screen.getByText(profile.email)).toBeInTheDocument();
  change('Nombre visible', 'Ana María');
  click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me', expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ display_name: 'Ana María', contact_number: null,
      faculty: 'Ciencias e Ingenierías Físicas y Formales', career: 'Ingeniería de Sistemas' }),
  })));
  expect(await screen.findByRole('status')).toHaveTextContent(/se guardó correctamente/i);
  expect(await screen.findByRole('heading', { name: 'Página de inicio' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Mi perfil' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Avatar/)).not.toBeInTheDocument();
});

it('uploads only the prepared photo bytes with their converted MIME type', async () => {
  setup();
  const input = await screen.findByLabelText(/Foto de perfil/);
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'foto.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me/photo', expect.objectContaining({
    method: 'PUT', body: expect.any(Blob), headers: { 'Content-Type': 'image/webp' },
  })));
  expect(preparePhoto).toHaveBeenCalledWith(file);
  expect(apiRequest.mock.calls.find(([path]) => path === '/users/me/photo')[1].body).not.toBe(file);
});

it('shows a preparation error without saving or uploading the profile', async () => {
  setup();
  preparePhoto.mockRejectedValue(new Error('Selecciona una foto válida, como JPEG, PNG o WebP.'));
  const input = await screen.findByLabelText(/Foto de perfil/);
  fireEvent.change(input, { target: { files: [new File(['<svg/>'], 'image.svg', { type: 'image/svg+xml' })] } });
  click('Guardar perfil');
  expect(await screen.findByRole('alert')).toHaveTextContent(/JPEG, PNG o WebP/);
  expect(apiRequest).toHaveBeenCalledTimes(2);
});

it('prepares photos larger than 2 MB instead of rejecting them', async () => {
  setup();
  const input = await screen.findByLabelText(/Foto de perfil/);
  const original = new File([new Uint8Array(4 * 1024 * 1024)], 'grande.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [original] } });
  click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me/photo', expect.objectContaining({ method: 'PUT' })));
  expect(preparePhoto).toHaveBeenCalledWith(original);
  expect(apiRequest.mock.calls.find(([path]) => path === '/users/me/photo')[1].body.size).toBeLessThanOrEqual(2 * 1024 * 1024);
});

it('explains a partial save if only the photo upload fails and keeps the selected file', async () => {
  setup();
  const input = await screen.findByLabelText(/Foto de perfil/);
  const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  apiRequest.mockImplementation(path => path === '/users/me/photo'
    ? Promise.reject(new Error('Sin conexión')) : Promise.resolve({ ...profile, display_name: 'Nombre guardado' }));
  fireEvent.change(input, { target: { files: [photo] } });
  click('Guardar perfil');
  expect(await screen.findByRole('alert')).toHaveTextContent(/datos del perfil se guardaron.*foto.*Sin conexión/);
  expect(input.files[0]).toBe(photo);
  expect(screen.queryByRole('heading', { name: 'Página de inicio' })).not.toBeInTheDocument();
  expect(apiRequest.mock.calls.filter(([path]) => path === '/users/academic-catalog')).toHaveLength(1);
});

it('waits for the photo upload before confirming success and returning home', async () => {
  setup();
  const input = await screen.findByLabelText(/Foto de perfil/);
  let finishUpload;
  const uploading = new Promise(resolve => { finishUpload = resolve; });
  apiRequest.mockImplementation(path => path === '/users/me/photo' ? uploading : Promise.resolve(profile));
  fireEvent.change(input, { target: { files: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] } });
  click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me/photo', expect.anything()));
  expect(screen.getByRole('heading', { name: 'Mi perfil' })).toBeInTheDocument();
  expect(screen.queryByText('Tu perfil se guardó correctamente.')).not.toBeInTheDocument();
  await act(async () => { finishUpload(profile); });
  expect(await screen.findByRole('heading', { name: 'Página de inicio' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Tu perfil se guardó correctamente.');
  click('Cerrar confirmación');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('shows loading and retry after profile load fails', async () => {
  apiRequest.mockRejectedValue(new Error('Sin conexión'));
  render(<MemoryRouter><AppToast><UserProfile /></AppToast></MemoryRouter>);
  expect(screen.getByRole('status')).toHaveTextContent(/Cargando/);
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  apiRequest.mockImplementation(path => Promise.resolve(path === '/users/academic-catalog' ? catalog : { ...profile, avatar_url: null }));
  click('Reintentar');
  expect(await screen.findByLabelText('Nombre visible')).toHaveValue('Ana');
});

it('requires a session without fetching private profile data', () => {
  sessionStorage.clear();
  render(<MemoryRouter><AppToast><UserProfile /></AppToast></MemoryRouter>);
  expect(screen.getByRole('alert')).toHaveTextContent(/Inicia sesión/);
  expect(apiRequest).not.toHaveBeenCalled();
});

it('uses one searchable selector per field and resets career when faculty changes', async () => {
  setup();
  const faculty = await screen.findByRole('combobox', { name: 'Facultad' });
  expect(screen.queryByLabelText('Buscar facultad')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Buscar carrera')).not.toBeInTheDocument();
  fireEvent.change(faculty, { target: { value: 'sociales' } });
  expect(screen.getByRole('option', { name: 'Ciencias Sociales y Humanidades' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Ciencias Sociales y Humanidades' }));
  const career = screen.getByRole('combobox', { name: 'Carrera' });
  expect(career).toHaveValue('');
  fireEvent.change(career, { target: { value: 'psico' } });
  expect(screen.getByRole('option', { name: 'Psicología' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Psicología' }));
  click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me', expect.objectContaining({
    body: expect.stringContaining('"career":"Psicología"'),
  })));
});

it('does not save typed text until the matching option is selected', async () => {
  setup();
  const career = await screen.findByRole('combobox', { name: 'Carrera' });
  fireEvent.change(career, { target: { value: 'Ingeniería Biomédica' } });
  click('Guardar perfil');
  expect(apiRequest).not.toHaveBeenCalledWith('/users/me', expect.objectContaining({ method: 'PATCH' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Escoge una facultad y una carrera válida/);
});

it('supports choosing filtered options with the keyboard', async () => {
  setup();
  const faculty = await screen.findByRole('combobox', { name: 'Facultad' });
  fireEvent.change(faculty, { target: { value: 'sociales' } });
  fireEvent.keyDown(faculty, { key: 'ArrowDown' });
  fireEvent.keyDown(faculty, { key: 'Enter' });
  expect(faculty).toHaveValue('Ciencias Sociales y Humanidades');
  const career = screen.getByRole('combobox', { name: 'Carrera' });
  fireEvent.change(career, { target: { value: 'psico' } });
  fireEvent.keyDown(career, { key: 'ArrowDown' });
  fireEvent.keyDown(career, { key: 'Enter' });
  expect(career).toHaveValue('Psicología');
  click('Guardar perfil');
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/users/me', expect.objectContaining({
    body: expect.stringContaining('"career":"Psicología"'),
  })));
});

it('discards unselected search text when leaving the field', async () => {
  setup();
  const career = await screen.findByRole('combobox', { name: 'Carrera' });
  fireEvent.change(career, { target: { value: 'No existe' } });
  fireEvent.blur(career);
  expect(career).toHaveValue('');
});

it('does not submit legacy arbitrary faculty text as a valid selection', async () => {
  setup({ ...profile, faculty: 'Facultad inventada', career: null });
  expect(await screen.findByText(/facultad o carrera anterior no está/)).toBeInTheDocument();
  click('Guardar perfil');
  expect(apiRequest).not.toHaveBeenCalledWith('/users/me', expect.objectContaining({ method: 'PATCH' }));
});

it('explains why saving is blocked when required academic fields are empty', async () => {
  setup({ ...profile, faculty: null, career: null });
  await screen.findByLabelText('Nombre visible');
  click('Guardar perfil');
  expect(await screen.findByRole('alert')).toHaveTextContent(/selecciona.*facultad.*carrera/i);
  expect(screen.getByRole('alert')).toHaveFocus();
  expect(apiRequest).not.toHaveBeenCalledWith('/users/me', expect.objectContaining({ method: 'PATCH' }));
  fireEvent.focus(screen.getByRole('combobox', { name: 'Facultad' }));
  fireEvent.click(screen.getByRole('option', { name: 'Ciencias e Ingenierías Físicas y Formales' }));
  fireEvent.focus(screen.getByRole('combobox', { name: 'Carrera' }));
  fireEvent.click(screen.getByRole('option', { name: 'Ingeniería de Sistemas' }));
  click('Guardar perfil');
  expect(await screen.findByRole('status')).toHaveTextContent('Tu perfil se guardó correctamente.');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('explains why saving is blocked when the visible name is empty', async () => {
  setup();
  await screen.findByLabelText('Nombre visible');
  change('Nombre visible', '');
  click('Guardar perfil');
  expect(await screen.findByRole('alert')).toHaveTextContent(/nombre visible/i);
  expect(apiRequest).not.toHaveBeenCalledWith('/users/me', expect.objectContaining({ method: 'PATCH' }));
});
