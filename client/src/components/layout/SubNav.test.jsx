import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import SubNav from './SubNav';
import { publicationCategories } from '../../lib/publication-options';
const setup = (url='/') => render(<MemoryRouter initialEntries={[url]}><SubNav/></MemoryRouter>);
it('shows Others and exposes every publication category through the dropdown', () => {
  setup();
  expect(screen.getByRole('link', {name:'Otros'})).toHaveAttribute('href','/?category=Otros');
  fireEvent.click(screen.getByRole('button', {name:'Más categorías'}));
  for (const category of publicationCategories) expect(screen.getByRole('link', {name:category})).toBeInTheDocument();
  expect(screen.getByRole('button', {name:'Más categorías'})).toHaveAttribute('aria-expanded','true');
});
it('preserves search and condition when choosing a category and closes after navigation', () => {
  setup('/?q=equipo&condition=Nuevo');
  fireEvent.click(screen.getByRole('button', {name:'Más categorías'}));
  const link=screen.getByRole('link', {name:'Deportes'});
  expect(link).toHaveAttribute('href','/?q=equipo&condition=Nuevo&category=Deportes');
  fireEvent.click(link);
  expect(screen.getByRole('button', {name:'Deportes'})).toHaveAttribute('aria-expanded','false');
});
it('closes with Escape or an outside click and highlights the selected category', () => {
  setup('/?category=Herramientas');
  const trigger=screen.getByRole('button', {name:'Herramientas'});
  fireEvent.click(trigger);
  expect(screen.getByRole('link', {name:'Herramientas'})).toHaveAttribute('aria-current','page');
  fireEvent.keyDown(document, {key:'Escape'});
  expect(trigger).toHaveFocus();expect(trigger).toHaveAttribute('aria-expanded','false');
  fireEvent.click(trigger);fireEvent.pointerDown(document.body);
  expect(trigger).toHaveAttribute('aria-expanded','false');
});
