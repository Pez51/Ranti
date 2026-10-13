import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import ChatPaymentDialog from './ChatPaymentDialog';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
const operation={id:'op-1',status:'Pendiente de pago/garantía',handoff:{agreed:true,is_owner:false,change_requested:false,meeting_at:'2026-10-14T15:00:00Z',location:'Biblioteca UCSM'},payment_quote:{amount:'40.00',unit_count:1}};
beforeEach(()=>{
  vi.resetAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.open=false;}});
});
it('shows the server quote and requires an explicit confirmation before simulating payment',async()=>{
  apiRequest.mockResolvedValueOnce({operation}).mockResolvedValueOnce({operation:{...operation,status:'Lista para entrega'}});
  const onCompleted=vi.fn();render(<ChatPaymentDialog operationId="op-1" token="token" onCompleted={onCompleted}/>);
  await screen.findByText(/Total de uso simulado: S\/ 40.00/);
  expect(apiRequest).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button',{name:'Confirmar simulación sin cobro'}));
  await waitFor(()=>expect(onCompleted).toHaveBeenCalledTimes(1));
  expect(apiRequest.mock.calls[1][0]).toBe('/operations/op-1/payment-simulation');
  expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({confirm_simulation:true});
});
it.each([{...operation,status:'Aceptada'},{...operation,handoff:{...operation.handoff,is_owner:true}},{...operation,payment_simulation:{completed:true}}])('blocks payment when the current operation is not eligible',async current=>{
  apiRequest.mockResolvedValueOnce({operation:current});render(<ChatPaymentDialog operationId="op-1" token="token"/>);
  await screen.findByText(/El pago ya fue simulado o el acuerdo cambió/);
  expect(screen.getByRole('button',{name:'Confirmar simulación sin cobro'})).toBeDisabled();
  expect(apiRequest).toHaveBeenCalledTimes(1);
});
it('keeps the confirmation open after an API failure',async()=>{
  apiRequest.mockResolvedValueOnce({operation}).mockRejectedValueOnce(new Error('El acuerdo cambió'));
  const onCompleted=vi.fn();render(<ChatPaymentDialog operationId="op-1" token="token" onCompleted={onCompleted}/>);
  await screen.findByText(/Total de uso simulado/);
  fireEvent.click(screen.getByRole('button',{name:'Confirmar simulación sin cobro'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('El acuerdo cambió');
  expect(onCompleted).not.toHaveBeenCalled();expect(screen.getByRole('dialog')).toBeInTheDocument();
});
