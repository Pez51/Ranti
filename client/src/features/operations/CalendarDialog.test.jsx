import { fireEvent,render,screen } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { useState } from 'react';
import AppToast from '../../components/layout/AppToast';
import CalendarDialog from './CalendarDialog';
vi.mock('./DealCalendar',()=>({default:({onSaved})=><button onClick={()=>onSaved('Tus horarios se guardaron correctamente.')}>Guardar mis horarios</button>}));
it('closes the calendar and leaves a visible success toast outside the dialog',()=>{
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(){this.open=false;}});
  function View(){const [open,setOpen]=useState(true);return <AppToast>{open&&<CalendarDialog deals={[{id:'op-1'}]} token="token" title="Calculadora" onClose={()=>setOpen(false)}/>}</AppToast>;}
  render(<View/>);
  fireEvent.click(screen.getByRole('button',{name:'Guardar mis horarios'}));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Tus horarios se guardaron correctamente.');
});
