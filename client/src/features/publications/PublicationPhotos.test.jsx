import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PublicationForm from './PublicationForm';
import { apiRequest } from '../../lib/api';
import { preparePhoto } from '../../lib/prepare-photo';
const cropControl=vi.hoisted(()=>({auto:true}));
vi.mock('./PhotoCropDialog',async()=>{
  const {useEffect}=await import('react');
  return {default:function CropStub({blob,onConfirm,onCancel}){
    useEffect(()=>{if(cropControl.auto) onConfirm(blob);},[blob,onConfirm]);
    return <div role="dialog" aria-label="Acomodar foto"><button onClick={()=>onConfirm(blob)} type="button">Usar este encuadre</button><button onClick={onCancel} type="button">Cancelar recorte</button></div>;
  }};
});
vi.mock('../../lib/api', async original => ({ ...(await original()), apiRequest:vi.fn() }));
vi.mock('../../lib/prepare-photo', () => ({preparePhoto:vi.fn()}));
const url = n => `/api/publications/photos/11111111-1111-4111-8111-${String(n).padStart(12,'0')}`;
const file = () => new File(['raw'], 'foto.jpg', {type:'image/jpeg'});
beforeEach(() => { vi.resetAllMocks(); cropControl.auto=true; preparePhoto.mockResolvedValue(new Blob(['prepared'],{type:'image/webp'})); });
afterEach(()=>{vi.unstubAllGlobals();});
it('compresses multiple files, uploads binary data, changes cover and saves only server references', async () => {
  apiRequest.mockResolvedValueOnce({url:url(1)}).mockResolvedValueOnce({url:url(2)});
  const save = vi.fn(); render(<PublicationForm onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar fotos del artículo'), {target:{files:[file(),file()]}});
  expect(screen.getByRole('button',{name:'Subiendo fotos…'})).toBeDisabled();
  await screen.findByAltText('Foto 2 del artículo');
  expect(preparePhoto).toHaveBeenCalledTimes(4);
  expect(apiRequest.mock.calls[0][1]).toMatchObject({method:'POST',headers:{'Content-Type':'image/webp'}});
  expect(apiRequest.mock.calls[0][1].body).toBeInstanceOf(Blob);
  fireEvent.keyDown(screen.getByRole('button',{name:'Mover foto 2'}),{key:'ArrowLeft'});
  fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
  await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({images:[url(2),url(1)]})));
  fireEvent.click(screen.getByRole('button',{name:'Quitar foto 1'}));
  expect(screen.queryByAltText('Foto 2 del artículo')).not.toBeInTheDocument();
});
it('rejects more than seven files before processing', async () => {
  render(<PublicationForm onSave={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar fotos del artículo'), {target:{files:Array.from({length:8},file)}});
  expect(await screen.findByRole('alert')).toHaveTextContent('hasta 7');
  expect(preparePhoto).not.toHaveBeenCalled(); expect(apiRequest).not.toHaveBeenCalled();
});
it('does not upload until the crop is confirmed and cancels without adding a photo',async()=>{
  cropControl.auto=false; render(<PublicationForm onSave={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar fotos del artículo'),{target:{files:[file()]}});
  await screen.findByRole('dialog',{name:'Acomodar foto'});
  expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Cancelar recorte'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar borrador'})).toBeEnabled());
  expect(screen.queryByAltText('Foto 1 del artículo')).not.toBeInTheDocument();
  expect(apiRequest).not.toHaveBeenCalled();
});
it('adjusts an existing photo without changing its position or other photos',async()=>{
  cropControl.auto=false;
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['original'],{type:'image/webp'})}));
  apiRequest.mockResolvedValueOnce({url:url(9)});
  const save=vi.fn();render(<PublicationForm initial={{images:[url(1),url(2)]}} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Mover foto 2'}));
  await screen.findByRole('dialog',{name:'Acomodar foto'});expect(apiRequest).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Usar este encuadre'}));
  await waitFor(()=>expect(screen.getByAltText('Foto 2 del artículo')).toHaveAttribute('src',expect.stringContaining(url(9))));
  fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({images:[url(1),url(9)]})));
});
it('cancels adjustment of an existing photo without replacing it',async()=>{
  cropControl.auto=false;
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['original'],{type:'image/webp'})}));
  render(<PublicationForm initial={{images:[url(1)]}} onSave={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Mover foto 1'}));
  await screen.findByRole('dialog',{name:'Acomodar foto'});
  fireEvent.click(screen.getByRole('button',{name:'Cancelar recorte'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Guardar borrador'})).toBeEnabled());
  expect(screen.getByAltText('Foto 1 del artículo')).toHaveAttribute('src',expect.stringContaining(url(1)));
  expect(apiRequest).not.toHaveBeenCalled();
});
it('keeps earlier successes after a failed camera or gallery upload and re-enables save', async () => {
  apiRequest.mockResolvedValueOnce({url:url(1)}).mockRejectedValueOnce(new Error('Sin conexión'));
  render(<PublicationForm onSave={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar fotos del artículo'), {target:{files:[file(),file()]}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');
  expect(screen.getByAltText('Foto 1 del artículo')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Guardar borrador'})).toBeEnabled();
});
it('hides native file selectors and keeps four square slots in one list', () => {
  render(<PublicationForm onSave={vi.fn()}/>);
  expect(screen.getByLabelText('Seleccionar fotos del artículo')).toHaveAttribute('hidden');
  expect(screen.getByLabelText('Seleccionar fotos del artículo')).toHaveStyle({display:'none'});
  expect(screen.getByLabelText('Tomar foto del artículo')).toHaveStyle({display:'none'});
  expect(screen.getByRole('list',{name:'Orden de las fotos'}).children).toHaveLength(4);
});
it.each([[3,4],[4,5],[5,6],[6,7],[7,7]])('shows %s photos with %s total slots', (count,slots) => {
  render(<PublicationForm initial={{images:Array.from({length:count},(_,i)=>url(i+1))}} onSave={vi.fn()}/>);
  expect(screen.getByRole('list',{name:'Orden de las fotos'}).children).toHaveLength(slots);
  if (count === 7) {
    expect(screen.queryByRole('button',{name:'Agregar fotos'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Tomar foto'})).toBeDisabled();
  } else expect(screen.getByRole('button',{name:'Agregar fotos'})).toBeEnabled();
});
it('accepts seven files in one selection and saves all seven in order', async () => {
  for (let i=1;i<=7;i++) apiRequest.mockResolvedValueOnce({url:url(i)});
  const save=vi.fn(); render(<PublicationForm onSave={save}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar fotos del artículo'),{target:{files:Array.from({length:7},file)}});
  await screen.findByAltText('Foto 7 del artículo');
  fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({images:Array.from({length:7},(_,i)=>url(i+1))})));
});
it('renumbers remaining photos without gaps after removing the second photo and persists that order', async () => {
  const save=vi.fn(); render(<PublicationForm initial={{images:[url(1),url(2),url(3),url(4)]}} onSave={save}/>);
  fireEvent.click(screen.getByRole('button',{name:'Quitar foto 2'}));
  expect(screen.getByAltText('Foto 1 del artículo')).toHaveAttribute('src',expect.stringContaining(url(1)));
  expect(screen.getByAltText('Foto 2 del artículo')).toHaveAttribute('src',expect.stringContaining(url(3)));
  expect(screen.getByAltText('Foto 3 del artículo')).toHaveAttribute('src',expect.stringContaining(url(4)));
  expect(screen.queryByRole('button',{name:'Mover foto 4'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
  await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({images:[url(1),url(3),url(4)]})));
});
it('drags a photo sideways and makes the first remaining photo the cover when removing it', async () => {
  vi.stubGlobal('PointerEvent',MouseEvent);
  try {
    const save=vi.fn(); render(<PublicationForm initial={{images:[url(1),url(2),url(3)]}} onSave={save}/>);
    const list=screen.getByRole('list',{name:'Orden de las fotos'});
    Array.from(list.children).forEach((tile,i)=>vi.spyOn(tile,'getBoundingClientRect').mockReturnValue({left:i*110,width:100}));
    const third=screen.getByRole('button',{name:'Mover foto 3'});
    fireEvent.pointerDown(third,{clientX:270,button:0}); fireEvent.pointerMove(third,{clientX:50}); fireEvent.pointerUp(third);
    expect(screen.getByAltText('Foto 1 del artículo')).toHaveAttribute('src',expect.stringContaining(url(3)));
    fireEvent.click(screen.getByRole('button',{name:'Quitar foto 1'}));
    expect(screen.getByAltText('Foto 1 del artículo')).toHaveAttribute('src',expect.stringContaining(url(1)));
    fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
    await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({images:[url(1),url(2)]})));
  } finally { vi.unstubAllGlobals(); }
});
