import { it,expect } from 'vitest';
import { render,screen } from '@testing-library/react';
import ReputationSummary from './ReputationSummary';
it('shows separate role scores for another person and counts actual evaluations',()=>{
 render(<ReputationSummary profile={{id:'user-1',reputation:{as_owner:{count:3,score:4.67},as_requester:{count:1,score:2}}}}/>);
 expect(screen.getByText('Como oferente')).toBeInTheDocument();expect(screen.getByText('Como comprador/arrendatario')).toBeInTheDocument();
 expect(screen.getByText(/4.67 \/ 5.*3 evaluaciones/)).toBeInTheDocument();expect(screen.getByText(/2.00 \/ 5.*1 evaluaciones/)).toBeInTheDocument();
});
it('shows own received comments without any own stars or legacy score, even if supplied erroneously',()=>{
 render(<ReputationSummary profile={{id:'self',is_self:true,reputation_score:'4.99',reputation:{as_owner:{count:1,score:4},as_requester:{count:0,score:null}},received_comments:[{id:'r-1',subject_role:'owner',modality:'Venta',comment:'Buen trato.',author_name:'Ana',rating:4}]}}/>);
 expect(screen.getByText('Buen trato.')).toBeInTheDocument();expect(screen.queryByText(/★/)).not.toBeInTheDocument();expect(screen.queryByText('4.99')).not.toBeInTheDocument();
 expect(screen.getByText('1 evaluaciones publicadas recibidas')).toBeInTheDocument();
});
it('does not present an unevaluated person as having a zero score',()=>{
 render(<ReputationSummary profile={{id:'other',reputation:{as_owner:{count:0,score:null},as_requester:{count:0,score:null}}}}/>);
 expect(screen.getAllByText(/Sin evaluaciones todavía.*0 evaluaciones/)).toHaveLength(2);expect(screen.queryByText(/0.00 \/ 5/)).not.toBeInTheDocument();
});
