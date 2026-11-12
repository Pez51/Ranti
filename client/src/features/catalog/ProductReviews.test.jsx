import { beforeEach,it,expect,vi } from 'vitest';
import { render,screen,fireEvent } from '@testing-library/react';
import ProductReviews from './ProductReviews';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
beforeEach(()=>vi.resetAllMocks());
it('shows published product stars and comments independently from the owner reputation',async()=>{
 apiRequest.mockResolvedValue({count:1,score:2,items:[{id:'r-1',rating:2,comment:'El equipo tenía detalles.',author_name:'Ana',modality:'Alquiler'}],has_more:false});
 render(<ProductReviews publicationId="pub-1"/>);fireEvent.click(screen.getByRole('button',{name:'Reseñas del producto'}));
 expect(await screen.findByText('El equipo tenía detalles.')).toBeInTheDocument();expect(screen.getByText(/2.00 \/ 5.*1 reseñas/)).toBeInTheDocument();
 expect(screen.getByText(/no la reputación de su oferente/)).toBeInTheDocument();
});
it('shows absence of published product reviews without displaying a zero score',async()=>{
 apiRequest.mockResolvedValue({count:0,score:null,items:[],has_more:false});render(<ProductReviews publicationId="pub-1"/>);
 fireEvent.click(screen.getByRole('button',{name:'Reseñas del producto'}));expect(await screen.findByText(/Sin reseñas todavía.*0 reseñas/)).toBeInTheDocument();expect(screen.queryByText(/0.00 \/ 5/)).not.toBeInTheDocument();
});
