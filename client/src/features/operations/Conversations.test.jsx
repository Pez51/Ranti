import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { MemoryRouter,Routes,Route } from 'react-router-dom';
import Conversations from './Conversations';
import OpenChat from './OpenChat';
import { apiRequest } from '../../lib/api';
import { session } from '../../test/workflows';
import { StrictMode } from 'react';
import { ConversationWindow } from './Conversations';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('./DealCalendar',()=>({default:({deal,defaultOpen})=><div>Calendario de {deal.id} · {defaultOpen?'Abierto':'Cerrado'}</div>}));
vi.mock('./ChatPaymentDialog',()=>({default:({operationId})=><div role="dialog" aria-label="Pago simulado del trato">Pago de {operationId}</div>}));
beforeEach(()=>{vi.resetAllMocks();session();});
function setup(path='/mensajes/chat-1'){return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/mensajes/:id" element={<Conversations/>}/><Route path="/mensajes" element={<Conversations/>}/><Route path="/producto/1" element={<OpenChat publicationId="1"/>}/></Routes></MemoryRouter>);}
const data={items:[],before:null,publication:{id:'p-1',title:'Calculadora'},counterpart_name:'María'};
it('shows persisted workflow updates and the requester payment bubble without opening the calendar',async()=>{
  apiRequest.mockResolvedValueOnce({...data,is_my_product:false,deals:[{id:'op-1',status:'Pendiente de pago/garantía',payment_available:true}],items:[{id:'9',kind:'workflow_event',event_type:'handoff.agree',operation_id:'op-1',body:'Confirmó el lugar y horario.',mine:false,created_at:'2026-10-13T10:00:00Z'}]});
  setup();await screen.findByText('Confirmó el lugar y horario.');
  expect(screen.getByText('Ranti · Actualización del trato')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Continuar al pago simulado'}));
  expect(screen.getByRole('dialog',{name:'Pago simulado del trato'})).toHaveTextContent('Pago de op-1');
});
it.each([true,false])('does not expose a payment action for owners or before an agreement (owner=%s)',async owner=>{
  apiRequest.mockResolvedValueOnce({...data,is_my_product:owner,deals:[{id:'op-1',status:'Aceptada',payment_available:owner}]});
  setup();await screen.findByRole('heading',{name:'Calculadora'});
  expect(screen.queryByRole('button',{name:'Continuar al pago simulado'})).not.toBeInTheDocument();
});
it('loads immediately after a StrictMode abort instead of waiting for the next polling interval',async()=>{
  apiRequest.mockResolvedValue(data);
  render(<StrictMode><MemoryRouter><ConversationWindow id="chat-1" token="token"/></MemoryRouter></StrictMode>);
  expect(await screen.findByRole('heading',{name:'Calculadora'})).toBeInTheDocument();
  expect(screen.getByLabelText('Mensaje')).not.toBeDisabled();
});
it('allows retry after a failed load instead of leaving a permanent spinner',async()=>{
  apiRequest.mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce(data);
  setup();await screen.findByText('Sin conexión');expect(screen.queryByText('Cargando chat…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Reintentar carga del chat'}));
  await screen.findByRole('heading',{name:'Calculadora'});expect(screen.getByLabelText('Mensaje')).not.toBeDisabled();
});
it('sends a quick bubble with one click without deleting a custom draft',async()=>{
  apiRequest.mockResolvedValueOnce(data).mockResolvedValueOnce({message:{id:'8',body:'Hola, ¿sigue disponible?',mine:true,created_at:'2026-10-13T10:00:00Z'}});
  setup();await screen.findByRole('heading',{name:'Calculadora'});
  fireEvent.change(screen.getByLabelText('Mensaje'),{target:{value:'Borrador personal'}});
  fireEvent.click(screen.getByRole('button',{name:'Hola, ¿sigue disponible?'}));
  await screen.findByText('Hola, ¿sigue disponible?',{selector:'p'});
  expect(screen.getByLabelText('Mensaje')).toHaveValue('Borrador personal');
  expect(screen.queryByRole('button',{name:'Hola, ¿sigue disponible?'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Calendario disponible al aceptar el trato'})).toBeDisabled();
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({body:'Hola, ¿sigue disponible?'});
});
it('sends a typed calendar invitation tied to an accepted deal',async()=>{
  apiRequest.mockResolvedValueOnce({...data,is_my_product:true,deals:[{id:'op-1',status:'Aceptada',modality:'Venta'}]})
    .mockResolvedValueOnce({message:{id:'9',kind:'calendar_invitation',operation_id:'op-1',body:'Invitación',mine:true,created_at:'2026-10-13T10:00:00Z'}});
  setup();await screen.findByRole('heading',{name:'Calculadora'});
  fireEvent.click(screen.getByRole('button',{name:'Invitar al calendario del encuentro'}));
  expect(await screen.findByText('Calendario para acordar el encuentro')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Elegir horarios y confirmar encuentro'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Invitar al calendario del encuentro'})).not.toBeInTheDocument();
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({kind:'calendar_invitation',operation_id:'op-1'});
});
it('keeps the calendar bubble after a quick reply and until its own send succeeds',async()=>{
  apiRequest.mockResolvedValueOnce({...data,deals:[{id:'op-1',status:'Aceptada'}]})
    .mockResolvedValueOnce({message:{id:'8',body:'Gracias, coordinemos el encuentro.',mine:true,created_at:'2026-10-13T10:00:00Z'}})
    .mockRejectedValueOnce(new Error('No se pudo enviar'))
    .mockResolvedValueOnce({message:{id:'9',kind:'calendar_invitation',operation_id:'op-1',mine:true,created_at:'2026-10-13T10:01:00Z'}});
  setup();await screen.findByRole('heading',{name:'Calculadora'});
  fireEvent.click(screen.getByRole('button',{name:'Gracias, coordinemos el encuentro.'}));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Gracias, coordinemos el encuentro.'})).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Invitar al calendario del encuentro'}));
  await screen.findByText('No se pudo enviar');
  expect(screen.getByRole('button',{name:'Invitar al calendario del encuentro'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button',{name:'Invitar al calendario del encuentro'}));
  await screen.findByText('Calendario para acordar el encuentro');
  expect(screen.queryByRole('button',{name:'Invitar al calendario del encuentro'})).not.toBeInTheDocument();
  expect(apiRequest.mock.calls[2][1].body).toBe(apiRequest.mock.calls[3][1].body);
});
it('retains text bubbles when sending one fails',async()=>{
  apiRequest.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('Sin conexión'));
  setup();await screen.findByRole('heading',{name:'Calculadora'});
  fireEvent.click(screen.getByRole('button',{name:'Hola, ¿sigue disponible?'}));
  await screen.findByText('Sin conexión');
  expect(screen.getByRole('button',{name:'Hola, ¿sigue disponible?'})).toBeEnabled();
});
it('does not offer another calendar invitation already sent by this user',async()=>{
  apiRequest.mockResolvedValueOnce({...data,deals:[{id:'op-1',status:'Aceptada'}],items:[{id:'9',kind:'calendar_invitation',operation_id:'op-1',mine:true,created_at:'2026-10-13T10:01:00Z'}]});
  setup();await screen.findByText('Calendario para acordar el encuentro');
  expect(screen.queryByRole('button',{name:'Invitar al calendario del encuentro'})).not.toBeInTheDocument();
});
it('opens the invited calendar outside the chat and closes it without losing the draft',async()=>{
  const showModal=vi.fn(function(){this.open=true;}),close=vi.fn(function(){this.open=false;});
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:showModal});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:close});
  apiRequest.mockResolvedValueOnce({...data,deals:[{id:'op-1',status:'Aceptada'},{id:'op-2',status:'Aceptada'}],items:[{id:'9',kind:'calendar_invitation',operation_id:'op-1',mine:false,created_at:'2026-10-13T10:01:00Z'}]});
  setup();await screen.findByText('Calendario para acordar el encuentro');
  const composer=screen.getByLabelText('Mensaje');
  fireEvent.change(composer,{target:{value:'Mi borrador'}});
  const trigger=screen.getByRole('button',{name:'Elegir horarios y confirmar encuentro'});trigger.focus();fireEvent.click(trigger);
  const dialog=screen.getByRole('dialog',{name:'Coordinar el encuentro'});
  expect(dialog.parentElement).toBe(document.body);
  expect(screen.getByText('Calendario de op-1 · Abierto')).toBeInTheDocument();
  expect(screen.queryByText('Calendario de op-2 · Abierto')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cerrar calendario y volver al chat'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(composer).toHaveValue('Mi borrador');expect(trigger).toHaveFocus();
  expect(showModal).toHaveBeenCalled();expect(close).toHaveBeenCalled();
});
it('starts a publication chat and navigates into it',async()=>{
  apiRequest.mockResolvedValueOnce({id:'chat-1'}).mockResolvedValueOnce(data);
  setup('/producto/1');fireEvent.click(screen.getByRole('button',{name:'Consultar al oferente'}));
  expect(await screen.findByRole('heading',{name:'Calculadora'})).toBeInTheDocument();
  expect(apiRequest.mock.calls[0][0]).toBe('/conversations/publication/1');
});
it('persists a message and displays HTML as text, never executable markup',async()=>{
  apiRequest.mockResolvedValueOnce({...data,items:[{id:'1',body:'<script>alert(1)</script>',created_at:'2026-10-13T10:00:00Z',mine:false}]}).mockResolvedValueOnce({message:{id:'2',body:'¿Dónde nos encontramos?',mine:true,created_at:'2026-10-13T10:01:00Z'}});
  const {container}=setup();await screen.findByText('<script>alert(1)</script>');expect(container.querySelector('script')).toBeNull();
  fireEvent.change(screen.getByLabelText('Mensaje'),{target:{value:'¿Dónde nos encontramos?'}});fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}));
  await screen.findByText('¿Dónde nos encontramos?');expect(screen.getByLabelText('Mensaje')).toHaveValue('');
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({body:'¿Dónde nos encontramos?',client_id:expect.any(String)});
});
it('keeps a failed draft and reuses its idempotency key on retry',async()=>{
  apiRequest.mockResolvedValueOnce(data).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({message:{id:'3',body:'Hola',mine:true,created_at:'2026-10-13T10:00:00Z'}});
  setup();await screen.findByText(/primera consulta/);fireEvent.change(screen.getByLabelText('Mensaje'),{target:{value:'Hola'}});fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}));
  await screen.findByText('Sin conexión');expect(screen.getByLabelText('Mensaje')).toHaveValue('Hola');fireEvent.click(screen.getByRole('button',{name:'Enviar mensaje'}));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledTimes(3));expect(apiRequest.mock.calls[1][1].body).toBe(apiRequest.mock.calls[2][1].body);
});
