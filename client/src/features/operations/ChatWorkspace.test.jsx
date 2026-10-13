import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { act,fireEvent,render,screen,within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ChatWorkspace from './ChatWorkspace';
import { apiRequest } from '../../lib/api';
import { session } from '../../test/workflows';
import { clearSession } from '../../lib/auth';
vi.mock('../../lib/api',async original=>({...await original(),apiRequest:vi.fn()}));
const methods=Object.fromEntries(['showModal','close'].map(name=>[name,Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,name)]));
const rows=[{id:'c-1',title:'Calculadora',counterpart_name:'María',counterpart_id:'u-1',is_my_product:true,last_message:'¿Está disponible?'},{id:'c-2',title:'Microscopio',counterpart_name:'Luis',counterpart_id:'u-2',is_my_product:false,last_message:'Nos vemos en la universidad.'}];
beforeEach(()=>{
  vi.resetAllMocks();session();
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value(){this.setAttribute('open','');}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value(){this.removeAttribute('open');}});
  apiRequest.mockImplementation(path=>{
    if(path.startsWith('/conversations?'))return Promise.resolve({items:rows});
    if(path.endsWith('/profile'))return Promise.resolve({id:'u-1',display_name:'María',email:'maria@ucsm.edu.pe',contact_number:'999123456',role:'Egresado',operations_count:2,reputation_score:'4.5'});
    const row=path.includes('c-1')?rows[0]:rows[1];
    return Promise.resolve({items:[],before:null,publication:{id:'p-1',title:row.title},counterpart:{id:row.counterpart_id,display_name:row.counterpart_name},counterpart_name:row.counterpart_name,is_my_product:row.is_my_product,deals:[]});
  });
});
afterEach(()=>{for(const [name,value]of Object.entries(methods)){if(value)Object.defineProperty(HTMLDialogElement.prototype,name,value);else delete HTMLDialogElement.prototype[name];}});
const setup=()=>render(<MemoryRouter><ChatWorkspace><p>Catálogo permanece visible</p></ChatWorkspace></MemoryRouter>);
it('opens multiple compact windows and distinguishes owned and wanted products',async()=>{
  setup();fireEvent.click(screen.getByRole('button',{name:'Chats'}));
  const tray=await screen.findByRole('complementary',{name:'Bandeja de conversaciones'});await screen.findByText('Calculadora');
  fireEvent.click(within(tray).getByRole('button',{name:/Calculadora/}));
  fireEvent.click(within(tray).getByRole('button',{name:/Microscopio/}));
  const owned=await screen.findByRole('region',{name:'Chat: María'}),wanted=await screen.findByRole('region',{name:'Chat: Luis'});
  expect(within(owned).getByText('Mi producto')).toBeInTheDocument();expect(within(wanted).getByText('Me interesa')).toBeInTheDocument();
  expect(screen.getByText('Catálogo permanece visible')).toBeInTheDocument();
});
it('retains a draft when minimizing and opens the clickable counterpart profile',async()=>{
  setup();fireEvent.click(screen.getByRole('button',{name:'Chats'}));await screen.findByText('Calculadora');
  const tray=screen.getByRole('complementary');fireEvent.click(within(tray).getByRole('button',{name:/Calculadora/}));
  const chat=await screen.findByRole('region',{name:'Chat: María'});
  fireEvent.change(within(chat).getByLabelText('Mensaje'),{target:{value:'Mi consulta pendiente'}});
  fireEvent.click(within(chat).getByRole('button',{name:'Minimizar chat'}));fireEvent.click(within(chat).getByRole('button',{name:'Restaurar chat'}));
  expect(within(chat).getByLabelText('Mensaje')).toHaveValue('Mi consulta pendiente');
  fireEvent.click(within(chat).getByRole('button',{name:'María'}));
  expect(await screen.findByText('maria@ucsm.edu.pe')).toBeInTheDocument();expect(screen.getByText('999123456')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Cerrar perfil'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('removes chats and private profile content immediately on logout',async()=>{
  setup();fireEvent.click(screen.getByRole('button',{name:'Chats'}));await screen.findByText('Calculadora');
  fireEvent.click(within(screen.getByRole('complementary')).getByRole('button',{name:'María'}));await screen.findByText('maria@ucsm.edu.pe');
  act(()=>clearSession());expect(screen.queryByText('maria@ucsm.edu.pe')).not.toBeInTheDocument();expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
});
