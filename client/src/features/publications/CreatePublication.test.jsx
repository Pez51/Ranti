import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreatePublication from './CreatePublication';
import { apiRequest } from '../../lib/api';
import { change, click, session, publication } from '../../test/workflows';
vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));
beforeEach(() => { vi.resetAllMocks(); session(); });
function setup() { render(<MemoryRouter><CreatePublication /></MemoryRouter>); }
function fill() { change('Título', 'Calculadora'); change('Descripción', 'Equipo cuidado'); change('Categoría', 'Ingeniería'); change('Estado físico', 'Usado'); change('Precio (S/)', '500'); change('Imágenes HTTPS (una por línea)', 'https://example.org/photo.png'); }
it('saves a draft before submitting and renders server risk/status without claiming approval', async () => {
  apiRequest.mockResolvedValueOnce({ message: 'Publicación creada exitosamente', publication }).mockResolvedValueOnce({ ...publication, status: 'Pendiente de revisión' }); setup(); fill(); click('Guardar borrador');
  expect(await screen.findByText(/Estado: Borrador/)).toBeInTheDocument(); expect(screen.getByText(/Riesgo: 2.*pilot-v1/)).toBeInTheDocument(); expect(apiRequest).toHaveBeenCalledTimes(1); click('Enviar publicación');
  expect(await screen.findByText(/Estado: Pendiente de revisión/)).toBeInTheDocument(); expect(apiRequest).toHaveBeenLastCalledWith('/publications/pub-1/submit', expect.objectContaining({ method: 'POST', token: 'real-token' }));
});
it('changes modality requirements and clears incompatible values in the submitted contract', async () => {
  apiRequest.mockResolvedValue({ publication }); setup(); fill(); change('Modalidad', 'Alquiler'); change('Garantía (S/)', '90'); change('Disponible desde', '2026-10-01'); change('Disponible hasta', '2026-10-04'); change('Modalidad', 'Préstamo');
  expect(screen.queryByLabelText('Precio (S/)')).not.toBeInTheDocument(); expect(screen.getByLabelText('Garantía (S/)')).toBeInTheDocument(); change('Modalidad', 'Venta'); expect(screen.queryByLabelText('Disponible desde')).not.toBeInTheDocument(); click('Guardar borrador');
  await waitFor(() => expect(apiRequest).toHaveBeenCalled()); const body = JSON.parse(apiRequest.mock.calls[0][1].body); expect(body).toMatchObject({ modality: 'Venta', guarantee_amount: '0', available_from: null, available_until: null });
});
it.each(['http://example.org/photo.png', 'https://a.org/1\nhttps://a.org/2\nhttps://a.org/3\nhttps://a.org/4\nhttps://a.org/5'])('rejects invalid or too many image references %s', async urls => {
  setup(); fill(); change('Imágenes HTTPS (una por línea)', urls); click('Guardar borrador'); expect(await screen.findByRole('alert')).toHaveTextContent(/HTTPS|4/); expect(apiRequest).not.toHaveBeenCalled();
});
it('explains risk thresholds and requires provenance plus images on submit', async () => {
  apiRequest.mockResolvedValue({ publication: { ...publication, price: '1000.00', images: [], risk_level: 3 } }); setup(); fill(); change('Precio (S/)', '1000'); change('Imágenes HTTPS (una por línea)', '');
  expect(screen.getByText(/S\/500.*S\/1000/)).toBeInTheDocument(); expect(screen.getByLabelText('Procedencia (URL HTTPS)')).toBeInTheDocument(); click('Guardar borrador'); await screen.findByText(/Estado: Borrador/); click('Enviar publicación'); expect(await screen.findByRole('alert')).toHaveTextContent(/1.*4|procedencia/i); expect(apiRequest).toHaveBeenCalledTimes(1);
});
it('requires a session and renders request errors with a retryable form', async () => {
  apiRequest.mockRejectedValue(new Error('Datos inválidos.')); setup(); fill(); click('Guardar borrador'); expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.'); expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled();
});
