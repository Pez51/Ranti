import { it,expect,vi } from 'vitest';
import { render,screen,fireEvent } from '@testing-library/react';
import AdminIncidences from './AdminIncidences';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
vi.mock('../operations/IncidencePanel',()=>({IncidenceCase:({id,admin})=><p>{admin?'Revisión administrativa':'Participante'} {id}</p>}));
it('opens a case from the administrative queue using its private administrative view',async()=>{
 apiRequest.mockResolvedValue({items:[{id:'case-1',title:'Router',modality:'Alquiler',status:'Abierta',type:'meeting',reporter_name:'Ana'}]});
 render(<AdminIncidences token="admin-token"/>);
 fireEvent.click(await screen.findByRole('button',{name:/Router/}));
 expect(screen.getByText('Revisión administrativa case-1')).toBeInTheDocument();
 expect(apiRequest).toHaveBeenCalledWith('/admin/incidences?offset=0',{token:'admin-token'});
});
