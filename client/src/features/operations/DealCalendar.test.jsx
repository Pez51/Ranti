import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import DealCalendar from './DealCalendar';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
const slot='2026-10-14T15:00:00.000Z';
const calendar={accepted_at:'2026-10-13T15:00:00.000Z',window_end:'2026-10-20T15:00:00.000Z',server_now:'2026-10-13T16:00:00.000Z',editable:true,revision:0,slots:[],skipped:false,other_submitted:true,other_skipped:false,location_preference:'Dentro de la UCSM — lugar por precisar',location_suggestion:'Dentro de la UCSM — lugar por precisar',recommendations:[{start:slot,end:'2026-10-14T15:30:00.000Z'}]};
const deal={id:'operation-1',status:'Aceptada',modality:'Venta'};
const operation={...deal,handoff:{revision:0,is_owner:false,meeting_at:null},payment_simulation:null};
beforeEach(()=>vi.resetAllMocks());
function setup(){apiRequest.mockImplementation(path=>Promise.resolve(path.endsWith('/calendar')?calendar:{operation}));render(<DealCalendar deal={deal} token="token"/>);fireEvent.click(screen.getByRole('button',{name:'Abrir calendario y coordinar entrega'}));}
it('opens a seven-day calendar, selects half-hour intervals and saves a private schedule',async()=>{
  setup();await screen.findByText(/Franjas de 30 minutos/);
  fireEvent.click(screen.getByRole('button',{name:/^mié.*14/}));
  fireEvent.click(screen.getByRole('checkbox',{name:'10:00–10:30'}));
  fireEvent.click(screen.getByRole('button',{name:'Guardar mis horarios'}));
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('/operations/operation-1/calendar',expect.objectContaining({method:'POST'})));
  const write=apiRequest.mock.calls.find(([,options])=>options.method==='POST');
  expect(JSON.parse(write[1].body)).toMatchObject({slots:[slot],revision:0,skipped:false});
});
it('can skip the calendar without skipping manual coordination',async()=>{
  setup();await screen.findByText(/Franjas de 30 minutos/);
  fireEvent.click(screen.getByRole('button',{name:'Omitir calendario y coordinar por chat'}));
  await waitFor(()=>expect(apiRequest.mock.calls.some(([,o])=>o.method==='POST')).toBe(true));
  const write=apiRequest.mock.calls.find(([,options])=>options.method==='POST');expect(JSON.parse(write[1].body)).toMatchObject({slots:[],skipped:true});
  expect(screen.getByRole('button',{name:'Proponer lugar y horario'})).toBeInTheDocument();
});
it('loads immediately when opened in the external calendar dialog',async()=>{
  apiRequest.mockImplementation(path=>Promise.resolve(path.endsWith('/calendar')?calendar:{operation}));
  render(<DealCalendar deal={deal} token="token" defaultOpen/>);
  await screen.findByText(/Franjas de 30 minutos/);
  expect(screen.getByRole('button',{name:'Guardar mis horarios'})).toBeInTheDocument();
});
it('adds and removes ranges without overwriting other days or sending automatically',async()=>{
  setup();await screen.findByText(/Franjas de 30 minutos/);
  fireEvent.click(screen.getByRole('button',{name:/^mié.*14/}));
  fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-10-14T14:00:00.000Z'}});
  fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-10-14T17:00:00.000Z'}});
  fireEvent.click(screen.getByRole('button',{name:'Marcar rango'}));
  fireEvent.click(screen.getByRole('button',{name:'Marcar rango'}));
  expect(screen.getAllByRole('checkbox').filter(input=>input.checked)).toHaveLength(6);
  fireEvent.click(screen.getByRole('button',{name:/jue.*15/}));
  fireEvent.click(screen.getByRole('checkbox',{name:'10:00–10:30'}));
  fireEvent.click(screen.getByRole('button',{name:/^mié.*14/}));
  fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-10-14T14:00:00.000Z'}});
  fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-10-14T15:00:00.000Z'}});
  fireEvent.click(screen.getByRole('button',{name:'Quitar rango'}));
  expect(screen.getAllByRole('checkbox').filter(input=>input.checked)).toHaveLength(4);
  expect(apiRequest.mock.calls.every(([,options])=>options.method!=='POST')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Limpiar este día'}));
  fireEvent.click(screen.getByRole('button',{name:'Guardar mis horarios'}));
  await waitFor(()=>expect(apiRequest.mock.calls.some(([,options])=>options.method==='POST')).toBe(true));
  const write=apiRequest.mock.calls.find(([,options])=>options.method==='POST');
  expect(JSON.parse(write[1].body).slots).toEqual(['2026-10-15T15:00:00.000Z']);
});
it('selects only available hours of the chosen day and disables reversed ranges',async()=>{
  setup();await screen.findByText(/Franjas de 30 minutos/);
  fireEvent.click(screen.getByRole('button',{name:'Marcar todo el día disponible'}));
  expect(screen.getAllByRole('checkbox').every(input=>input.checked)).toBe(true);
  expect(screen.queryByRole('checkbox',{name:'10:00–10:30'})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Desde'),{target:{value:'2026-10-13T18:00:00.000Z'}});
  fireEvent.change(screen.getByLabelText('Hasta'),{target:{value:'2026-10-13T17:00:00.000Z'}});
  expect(screen.getByRole('button',{name:'Marcar rango'})).toBeDisabled();
  expect(screen.getByRole('button',{name:'Quitar rango'})).toBeDisabled();
});
it('notifies and closes via callback only after the server confirms a save',async()=>{
  const onSaved=vi.fn();let finish;
  apiRequest.mockImplementation((path,options)=>options.method==='POST'?new Promise(resolve=>{finish=resolve;}):Promise.resolve(path.endsWith('/calendar')?calendar:{operation}));
  render(<DealCalendar deal={deal} token="token" defaultOpen onSaved={onSaved}/>);
  await screen.findByText(/Franjas de 30 minutos/);
  fireEvent.click(screen.getByRole('button',{name:'Guardar mis horarios'}));
  expect(onSaved).not.toHaveBeenCalled();
  finish({...calendar,revision:1});
  await waitFor(()=>expect(onSaved).toHaveBeenCalledWith(expect.stringContaining('se guardaron correctamente')));
  expect(screen.getByRole('status')).toHaveTextContent('Aún deben acordar y confirmar');
});
it('keeps the selected slots and does not close on a failed save',async()=>{
  const onSaved=vi.fn();
  apiRequest.mockImplementation((path,options)=>options.method==='POST'?Promise.reject(new Error('No se guardaron los horarios')):Promise.resolve(path.endsWith('/calendar')?calendar:{operation}));
  render(<DealCalendar deal={deal} token="token" defaultOpen onSaved={onSaved}/>);
  await screen.findByText(/Franjas de 30 minutos/);
  fireEvent.click(screen.getByRole('checkbox',{name:'12:00–12:30'}));
  fireEvent.click(screen.getByRole('button',{name:'Guardar mis horarios'}));
  await screen.findByRole('alert');
  expect(onSaved).not.toHaveBeenCalled();expect(screen.getByRole('checkbox',{name:'12:00–12:30'})).toBeChecked();
});
it('organizes availability, common slots and meeting into ordered sections, preserving proposals',async()=>{
  setup();await screen.findByText(/Franjas de 30 minutos/);
  const own=screen.getByRole('region',{name:'1. Tus horarios'}),common=screen.getByRole('region',{name:'2. Horarios en común'}),meeting=screen.getByRole('region',{name:'3. Encuentro y entrega'});
  expect(own.compareDocumentPosition(common)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(common.compareDocumentPosition(meeting)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(common).getByText('10:00–10:30')).toBeInTheDocument();
  expect(within(common).getByText('Hora de Perú')).toBeInTheDocument();
  apiRequest.mockImplementation((path,options)=>Promise.resolve(options.method==='POST'?{operation}:path.endsWith('/calendar')?calendar:{operation}));
  fireEvent.click(within(common).getByRole('button',{name:/Proponer.*10:00 a 10:30/}));
  await waitFor(()=>expect(apiRequest.mock.calls.some(([,options])=>options.method==='POST')).toBe(true));
  const write=apiRequest.mock.calls.find(([,options])=>options.method==='POST');
  expect(JSON.parse(write[1].body)).toMatchObject({action:'propose',revision:0,meeting_at:slot,location:calendar.location_preference});
});
