import { beforeEach,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,within } from '@testing-library/react';
import OperationReview from './OperationReview';
import { apiRequest } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn()}));
const state={operation_id:'op-1',modality:'Alquiler',is_owner:false,eligible:true,submitted:false,published:false,publication_days:7,publish_after:'2026-10-21T12:00:00Z'};
beforeEach(()=>vi.resetAllMocks());
it('keeps product/person questions separate and shows only metadata after a hidden submission',async()=>{
 apiRequest.mockResolvedValueOnce(state).mockResolvedValueOnce({...state,submitted:true,eligible:false});
 render(<OperationReview operationId="op-1" token="token"/>);fireEvent.click(screen.getByRole('button',{name:'Evaluar esta operación'}));
 const person=await screen.findByRole('radiogroup',{name:'¿Cómo fue tu experiencia con el oferente?'});
 fireEvent.click(within(person).getByRole('radio',{name:'4 estrellas'}));
 const product=screen.getByRole('radiogroup',{name:/artículo que alquilaste/});fireEvent.click(within(product).getByRole('radio',{name:'2 estrellas'}));
 fireEvent.change(screen.getByLabelText('Comentario sobre la persona (opcional)'),{target:{value:'Puntual y amable.'}});
 fireEvent.change(screen.getByLabelText('Reseña del producto (opcional)'),{target:{value:'El equipo tenía detalles.'}});
 fireEvent.click(screen.getByRole('button',{name:'Enviar evaluación'}));
 expect(await screen.findByRole('status')).toHaveTextContent('Evaluación enviada y oculta');
 expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toEqual({person_rating:4,person_comment:'Puntual y amable.',product_rating:2,product_comment:'El equipo tenía detalles.'});
 expect(screen.queryByText('Puntual y amable.')).not.toBeInTheDocument();expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
it('adapts the owner question to the renter and never lets the owner review their product',async()=>{
 apiRequest.mockResolvedValue({...state,is_owner:true});render(<OperationReview operationId="op-1" token="owner-token"/>);
 fireEvent.click(screen.getByRole('button',{name:'Evaluar esta operación'}));
 expect(await screen.findByRole('radiogroup',{name:'¿Cómo fue tu experiencia con el arrendatario?'})).toBeInTheDocument();
 expect(screen.queryByLabelText('Reseña del producto (opcional)')).not.toBeInTheDocument();expect(screen.getAllByRole('radiogroup')).toHaveLength(1);
});
it('does not render a rating form for ineligible or already evaluated operations',async()=>{
 apiRequest.mockResolvedValue({...state,eligible:false,reason:'Hay una incidencia pendiente.'});
 render(<OperationReview operationId="op-1" token="token"/>);fireEvent.click(screen.getByRole('button',{name:'Evaluar esta operación'}));
 expect(await screen.findByText('Hay una incidencia pendiente.')).toBeInTheDocument();expect(screen.queryByRole('radio')).not.toBeInTheDocument();
});
