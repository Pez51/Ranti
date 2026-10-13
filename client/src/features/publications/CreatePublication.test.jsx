import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CreatePublication from './CreatePublication';
import AppToast from '../../components/layout/AppToast';
import { apiRequest } from '../../lib/api';
import { change,click,session,publication } from '../../test/workflows';
vi.mock('../../lib/api',async original=>({...await original(),apiRequest:vi.fn()}));
vi.mock('./PublicationPhotos',()=>({default:({onChange})=><button type="button" onClick={()=>onChange(['https://example.org/photo.png'])}>Agregar foto de prueba</button>}));
const quote={modality:'Venta',unit:'operación',gross_amount:'500.00',service_fee:'25.00',service_fee_percent:5,owner_net:'475.00',guarantee_amount:'0.00',simulated:true};
beforeEach(()=>{vi.resetAllMocks();session();});
function setup(){render(<MemoryRouter><AppToast><CreatePublication/></AppToast></MemoryRouter>);}
function fill(){change('Título','Calculadora');change('Descripción','Equipo cuidado');change('Categoría','Tecnología');click('4 estrellas: Muy buen estado');click('Agregar foto de prueba');change('Precio (S/)','500');}
it('continues to a server-calculated owner summary before publishing, without buyer card costs',async()=>{
  apiRequest.mockResolvedValueOnce({publication}).mockResolvedValueOnce(quote).mockResolvedValueOnce({...publication,status:'Pendiente de revisión'});
  setup();fill();click('Continuar publicación');
  expect(await screen.findByRole('heading',{name:'Revisa tu publicación'})).toBeInTheDocument();
  expect(screen.getByText('S/ 475.00')).toBeInTheDocument();expect(screen.getByText('− S/ 25.00')).toBeInTheDocument();
  expect(screen.queryByText(/cargo.*tarjeta|procesador/i)).not.toBeInTheDocument();
  expect(apiRequest).toHaveBeenLastCalledWith('/publications/pub-1/pricing',expect.objectContaining({token:'real-token'}));
  click('Enviar publicación');expect(await screen.findByText('Estado: Pendiente de revisión')).toBeInTheDocument();
});
it('preserves saved fields when returning from the summary to edit',async()=>{
  const saved={...publication,category:'Tecnología',condition_rating:4};
  apiRequest.mockResolvedValueOnce({publication:saved}).mockResolvedValueOnce(quote);setup();fill();click('Continuar publicación');
  await screen.findByRole('heading',{name:'Revisa tu publicación'});click('Volver a editar');
  expect(screen.getByLabelText('Título')).toHaveValue('Calculadora');expect(screen.getByLabelText('Categoría')).toHaveValue('Tecnología');
  expect(screen.getByRole('button',{name:'4 estrellas: Muy buen estado'})).toHaveAttribute('aria-pressed','true');
});
it('opens the other category field and removes sale pricing for a solidarity loan',()=>{
  setup();change('Categoría','Otros');change('¿Qué tipo de artículo es?','Maquetas');change('Modalidad','Préstamo');
  expect(screen.queryByLabelText('Precio (S/)')).not.toBeInTheDocument();expect(screen.getByLabelText('Garantía (S/)')).toBeInTheDocument();
  expect(screen.getByText(/Presta para que el conocimiento/)).toBeInTheDocument();
  expect(screen.getByText(/Compartir también construye comunidad/)).toBeInTheDocument();
});
it('shows a character counter and prevents continuing over 1000 characters',()=>{
  setup();fill();change('Descripción','a'.repeat(1001));
  expect(screen.getByText(/1001\/1000 caracteres/)).toBeInTheDocument();
  expect(screen.getByLabelText('Descripción')).toHaveAttribute('maxlength','1000');
  expect(screen.getByRole('button',{name:'Continuar publicación'})).toBeDisabled();expect(apiRequest).not.toHaveBeenCalled();
});
it('counts spaces and line breaks and permits exactly 1000 characters',()=>{
  setup();fill();change('Descripción','Una foto\ny un artículo');
  expect(screen.getByText(/22\/1000 caracteres/)).toBeInTheDocument();
  change('Descripción','a'.repeat(1000));
  expect(screen.getByText(/1000\/1000 caracteres/)).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Continuar publicación'})).toBeEnabled();
});
it('explains rental pricing, guarantee and risk controls',()=>{
  setup();change('Modalidad','Alquiler');change('Precio (S/)','1000');
  expect(screen.getByText(/Tarifa:.*1000.00 por día de uso/)).toBeInTheDocument();
  change('¿Cada cuánto se cobra este precio?','hour');
  expect(screen.getByText(/1000.00 por hora de uso/)).toBeInTheDocument();
  expect(screen.getByText(/S\/500.*S\/1000/)).toBeInTheDocument();expect(screen.getByLabelText('Seleccionar boleta o comprobante')).toBeInTheDocument();
});
it('keeps the form retryable after save errors',async()=>{
  apiRequest.mockRejectedValue(new Error('Datos inválidos.'));setup();fill();click('Continuar publicación');
  expect(await screen.findByRole('alert')).toHaveTextContent('Datos inválidos.');expect(screen.getByRole('button',{name:'Continuar publicación'})).toBeEnabled();
});
it('continues a rental with a start date and optional end date',async()=>{
  const saved={...publication,modality:'Alquiler',price:'40.00',available_from:'2026-12-01T05:00:00.000Z',available_until:null,rental_unit:'day'};
  apiRequest.mockResolvedValueOnce({publication:saved}).mockResolvedValueOnce({...quote,modality:'Alquiler',unit:'día'});
  setup();fill();change('Modalidad','Alquiler');change('Precio (S/)','40');change('Disponible desde','2026-12-01');
  expect(screen.getByText(/Fecha de fin opcional: no es necesario/)).toBeInTheDocument();
  click('Continuar publicación');await screen.findByRole('heading',{name:'Revisa tu publicación'});
  expect(JSON.parse(apiRequest.mock.calls[0][1].body)).toMatchObject({available_from:'2026-12-01',available_until:null});
});
it('does not submit while viewing details and requires stars to continue',()=>{
  setup();change('Título','Equipo');change('Descripción','Equipo cuidado');change('Categoría','Tecnología');
  fireEvent.click(screen.getByRole('button',{name:'Continuar publicación'}));expect(screen.getByRole('alert')).toHaveTextContent('estado físico');
  expect(screen.queryByRole('button',{name:'Enviar publicación'})).not.toBeInTheDocument();expect(apiRequest).not.toHaveBeenCalled();
});
