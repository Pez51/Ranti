import { fireEvent,render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import HandoffPanel from './HandoffPanel';
const h={revision:0,meeting_at:null,location:null,is_owner:true,agreed:false,delivered:false,returned:false};
it.each(['Alquiler','Préstamo'])('rejects %s delivery at or after the requested start',modality=>{
  const onAction=vi.fn();render(<HandoffPanel operation={{status:'Aceptada',modality,start_date:'2026-12-01T15:00:00Z',handoff:h}} onAction={onAction}/>);
  expect(screen.getByText(/El calendario es opcional/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Proponer lugar y horario'}));
  fireEvent.change(screen.getByLabelText('Lugar de encuentro'),{target:{value:'Biblioteca'}});
  fireEvent.change(screen.getByLabelText('Fecha y hora de Perú'),{target:{value:'2026-12-01T10:00'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar propuesta de encuentro'}));
  expect(onAction).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toHaveTextContent('antes del inicio');
  fireEvent.change(screen.getByLabelText('Fecha y hora de Perú'),{target:{value:'2026-12-01T09:30'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar propuesta de encuentro'}));
  expect(onAction).toHaveBeenCalledWith(expect.objectContaining({meeting_at:'2026-12-01T14:30:00.000Z'}));
});
it('lets either side propose a Peru-local meeting',()=>{
  const onAction=vi.fn();render(<HandoffPanel operation={{status:'Aceptada',modality:'Venta',handoff:h}} onAction={onAction}/>);
  fireEvent.click(screen.getByRole('button',{name:'Proponer lugar y horario'}));
  fireEvent.change(screen.getByLabelText('Lugar de encuentro'),{target:{value:'Biblioteca'}});
  fireEvent.change(screen.getByLabelText('Fecha y hora de Perú'),{target:{value:'2026-12-01T10:00'}});
  fireEvent.click(screen.getByRole('button',{name:'Enviar propuesta de encuentro'}));
  expect(onAction).toHaveBeenCalledWith({action:'propose',revision:0,location:'Biblioteca',meeting_at:'2026-12-01T15:00:00.000Z',notes:''});
});
it('requires an explicit physical-delivery confirmation',()=>{
  const onAction=vi.fn();render(<HandoffPanel operation={{status:'Lista para entrega',modality:'Venta',payment_simulation:{completed:true},handoff:{...h,revision:1,agreed:true,meeting_at:'2026-10-01T10:00:00Z',location:'Biblioteca',proposed_by_you:true}}} onAction={onAction}/>);
  fireEvent.click(screen.getByRole('button',{name:'Confirmar que entregué el artículo'}));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Sí, confirmar entrega'}));
  expect(onAction).toHaveBeenCalledWith({action:'confirm-delivery',revision:1});
});
it('shows a return action for delivered rentals, not for sales',()=>{
  const {rerender}=render(<HandoffPanel operation={{status:'Entregada/Activa',modality:'Alquiler',handoff:{...h,delivered:true}}} onAction={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'Alquilado · En uso'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Confirmar que recibí la devolución'})).toBeInTheDocument();
  rerender(<HandoffPanel operation={{status:'Entregada/Activa',modality:'Venta',handoff:{...h,delivered:true}}} onAction={vi.fn()}/>);
  expect(screen.getByRole('heading',{name:'Vendido · Entrega confirmada'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/devolución/})).not.toBeInTheDocument();
});
