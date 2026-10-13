import { expect,it,vi } from 'vitest';
import { render,screen } from '@testing-library/react';
import Summary from './PublicationPricingSummary';
it('shows the server-provided 10 percent tier for a S/5 item',()=>{
  render(<Summary publication={{title:'Artículo'}} pricing={{modality:'Venta',unit:'operación',gross_amount:'5.00',service_fee:'0.50',service_fee_percent:10,owner_net:'4.50',guarantee_amount:'0.00'}} busy={false} onBack={vi.fn()} onPublish={vi.fn()}/>);
  expect(screen.getByText('Tarifa de servicio Ranti (10%)')).toBeInTheDocument();
  expect(screen.getByText('− S/ 0.50')).toBeInTheDocument();expect(screen.getByText('S/ 4.50')).toBeInTheDocument();
  expect(screen.queryByText('Tarifa de servicio Ranti (5%)')).not.toBeInTheDocument();
});
