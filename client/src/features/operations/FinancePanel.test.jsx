import { beforeEach,it,expect,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import FinancePanel from './FinancePanel';
import { apiRequest } from '../../lib/api';
import { downloadFinanceDocument } from '../../lib/finance-documents';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('../../lib/finance-documents',()=>({downloadFinanceDocument:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
const quote={id:'quote-1',method:'simulated',mode:'simulated',buyer:{price:'36.00',service_charge:'4.00',guarantee_declared:'100.00',guarantee_charged:'0.00',total:'40.00',guarantee_note:'No se cobra garantía.'}};
const base={operation_status:'Pendiente de pago/garantía',methods:[{id:'simulated',label:'Simulación local'}],quote:null,payment:null,transfer:{condition:'Recepción conforme',blocked_reason:'Sin transferencia'}};
it('shows a single service charge and requires exact acceptance before submitting payment',async()=>{
 apiRequest.mockResolvedValueOnce(base).mockResolvedValueOnce(quote).mockResolvedValueOnce({...base,quote,payment:{id:'payment',status:'simulated_succeeded',reference:'sim_reference'}});
 render(<FinancePanel operationId="op-1" token="token" defaultOpen/>);
 fireEvent.click(await screen.findByRole('button',{name:'Calcular y revisar total'}));
 await screen.findByText('S/ 36.00');expect(screen.getByText('Cargo de servicio')).toBeInTheDocument();expect(screen.queryByText(/Culqi.*S\//)).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Confirmar pago de prueba'})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:/Acepto el total de S\/ 40.00/}));fireEvent.click(screen.getByRole('button',{name:'Confirmar pago de prueba'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledTimes(3));
 const body=JSON.parse(apiRequest.mock.calls[2][1].body);expect(body).toMatchObject({quote_id:'quote-1',accepted_total:'40.00',confirm_test:true,scenario:'success'});
 expect(await screen.findByRole('button',{name:'Descargar constancia'})).toBeInTheDocument();
});
it('does not show buyer fees or payment controls to the owner and downloads the owner document',async()=>{
 const owner={gross_amount:'40.00',deduction:'4.00',net_amount:'36.00',explanation:'Política vigente'};
 apiRequest.mockResolvedValueOnce({...base,owner_estimate:owner,payment:{status:'simulated_succeeded'}}).mockResolvedValueOnce({kind:'owner'});
 render(<FinancePanel operationId="op-1" token="token" owner defaultOpen/>);
 await screen.findByText('Recibirás (importe neto)');expect(screen.queryByText('Cargo de servicio')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:'Confirmar pago de prueba'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Descargar liquidación'}));
 await waitFor(()=>expect(downloadFinanceDocument).toHaveBeenCalledWith({kind:'owner'}));
 expect(apiRequest.mock.calls[1][0]).toBe('/operations/op-1/finance/documents/owner');
});
it('preserves the payment idempotency key when a response is lost',async()=>{
 apiRequest.mockResolvedValueOnce({...base,quote}).mockRejectedValueOnce(new Error('Sin conexión')).mockResolvedValueOnce({...base,quote,payment:{status:'pending'}});
 render(<FinancePanel operationId="op-1" token="token" defaultOpen/>);
 fireEvent.click(await screen.findByRole('checkbox',{name:/Acepto el total/}));fireEvent.click(screen.getByRole('button',{name:'Confirmar pago de prueba'}));
 await screen.findByRole('alert');fireEvent.click(screen.getByRole('button',{name:'Confirmar pago de prueba'}));
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledTimes(3));expect(apiRequest.mock.calls[1][1].body).toBe(apiRequest.mock.calls[2][1].body);
});
it('requires acceptance again when refreshing reveals another quote or total',async()=>{
 apiRequest.mockResolvedValueOnce({...base,quote}).mockResolvedValueOnce({...base,quote:{...quote,id:'quote-2',buyer:{...quote.buyer,total:'41.00'}}});
 render(<FinancePanel operationId="op-1" token="token" defaultOpen/>);
 fireEvent.click(await screen.findByRole('checkbox',{name:/Acepto el total/}));
 expect(screen.getByRole('button',{name:'Confirmar pago de prueba'})).toBeEnabled();
 fireEvent.click(screen.getByRole('button',{name:'Actualizar estado económico'}));
 const checkbox=await screen.findByRole('checkbox',{name:/Acepto el total de S\/ 41.00/});
 expect(checkbox).not.toBeChecked();expect(screen.getByRole('button',{name:'Confirmar pago de prueba'})).toBeDisabled();
});
