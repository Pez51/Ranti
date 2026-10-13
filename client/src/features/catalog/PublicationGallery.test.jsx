import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PublicationGallery from './PublicationGallery';

const images = [1, 2, 3].map(number => ({ image_url: `https://example.com/${number}.jpg`, is_primary: number === 1 }));
const setup = (props = {}) => render(<PublicationGallery images={images} title="Calculadora" modality="Venta" {...props} />);
const dialogMethods = Object.fromEntries(['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.removeAttribute('open'); } });
});
afterEach(() => {
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  for (const [name, descriptor] of Object.entries(dialogMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else delete HTMLDialogElement.prototype[name];
  }
});

it('rotates every five seconds and wraps, supports thumbnails and both arrows', () => {
  setup();
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('button', { name: 'Ampliar foto 2 de 3' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver foto 3' }));
  fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }));
  expect(screen.getByRole('button', { name: 'Ver foto 1' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Foto anterior' }));
  expect(screen.getByRole('button', { name: 'Ampliar foto 3 de 3' })).toBeInTheDocument();
});

it('opens the full image, supports keyboard navigation and closes restoring focus', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Ampliar foto 1 de 3' }));
  const viewer = screen.getByRole('dialog', { name: 'Fotos de Calculadora' });
  expect(within(viewer).getByRole('img')).toHaveAttribute('src', images[0].image_url);
  fireEvent.keyDown(viewer, { key: 'ArrowRight' });
  expect(within(viewer).getByRole('img')).toHaveAttribute('src', images[1].image_url);
  act(() => vi.advanceTimersByTime(10000));
  expect(within(viewer).getByRole('img')).toHaveAttribute('src', images[1].image_url);
  fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar visor' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ampliar foto 2 de 3' })).toHaveFocus();
});

it('pauses on hover and with the pause control, resumes when requested', () => {
  setup();
  const gallery = screen.getByRole('region', { name: 'Fotos del artículo' });
  fireEvent.mouseEnter(gallery);
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByRole('button', { name: 'Ampliar foto 1 de 3' })).toBeInTheDocument();
  fireEvent.mouseLeave(gallery);
  fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByRole('button', { name: 'Ampliar foto 1 de 3' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reanudar' }));
  act(() => vi.advanceTimersByTime(5000));
  expect(screen.getByRole('button', { name: 'Ampliar foto 2 de 3' })).toBeInTheDocument();
});

it('respects reduced motion and allows manual navigation', () => {
  window.matchMedia.mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  setup();
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByRole('button', { name: 'Ampliar foto 1 de 3' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pausar' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Foto siguiente' }));
  expect(screen.getByRole('button', { name: 'Ampliar foto 2 de 3' })).toBeInTheDocument();
});

it('handles a single photo, missing photos and broken images', () => {
  const { unmount } = setup({ images: [images[0]] });
  expect(screen.queryByRole('button', { name: 'Foto siguiente' })).not.toBeInTheDocument();
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByText('Imagen no disponible')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ampliar foto 1 de 1' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  unmount();
  setup({ images: [] });
  expect(screen.getByText('Sin fotos')).toBeInTheDocument();
});
