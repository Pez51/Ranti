import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import AdminChats from './AdminChats';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
const conversation={id:'chat-1',title:'Calculadora',owner_name:'María',requester_name:'Pedro'};
const message={id:'3',body:'Consulta privada',sender_name:'Pedro',sender_is_owner:false,created_at:'2026-10-13T10:00:00Z'};
it('lists all chats and opens an explicitly read-only history without a message composer',async()=>{
  apiRequest.mockResolvedValueOnce({items:[conversation],has_more:false}).mockResolvedValueOnce({conversation,items:[message],before:null,read_only:true});
  render(<AdminChats token="token"/>);
  fireEvent.click(await screen.findByRole('button',{name:/Calculadora.*María.*Pedro/}));
  expect(await screen.findByText('Consulta privada')).toBeInTheDocument();
  expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Enviar mensaje'})).not.toBeInTheDocument();
  expect(apiRequest.mock.calls.every(([path,options])=>path.startsWith('/admin/conversations')&&!options.method)).toBe(true);
});
it('removes the old history if administrative access is revoked on refresh',async()=>{
  apiRequest.mockResolvedValueOnce({items:[conversation],has_more:false}).mockResolvedValueOnce({conversation,items:[message],before:null});
  render(<AdminChats token="token"/>);fireEvent.click(await screen.findByRole('button',{name:/Calculadora/}));await screen.findByText('Consulta privada');
  apiRequest.mockRejectedValueOnce(new Error('No tienes permiso'));
  fireEvent.click(screen.getByRole('button',{name:'Actualizar historial'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso');
  expect(screen.queryByText('Consulta privada')).not.toBeInTheDocument();
});
it('loads previous messages using the returned cursor and keeps their chronological order',async()=>{
  apiRequest.mockResolvedValueOnce({items:[conversation],has_more:false}).mockResolvedValueOnce({conversation,items:[message],before:'3'})
    .mockResolvedValueOnce({conversation,items:[{...message,id:'1',body:'Mensaje anterior'}],before:null});
  render(<AdminChats token="token"/>);fireEvent.click(await screen.findByRole('button',{name:/Calculadora/}));
  fireEvent.click(await screen.findByRole('button',{name:'Cargar mensajes anteriores'}));
  await screen.findByText('Mensaje anterior');
  expect(screen.getAllByRole('listitem').map(item=>item.textContent)).toEqual([expect.stringContaining('Mensaje anterior'),expect.stringContaining('Consulta privada')]);
  await waitFor(()=>expect(apiRequest.mock.calls[2][0]).toBe('/admin/conversations/chat-1/messages?before=3'));
});
