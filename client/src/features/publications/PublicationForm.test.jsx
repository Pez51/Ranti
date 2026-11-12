import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import PublicationForm from './PublicationForm';
vi.mock('./PublicationPhotos',()=>({default:()=>null}));
vi.mock('./ProvenanceUpload',()=>({default:({value})=><section aria-label="Boleta o comprobante">{value||'Sin comprobante'}</section>}));
const rental={title:'Router',description:'Equipo cuidado',category:'Tecnología',condition:'Buen estado',modality:'Alquiler',price:'40',guarantee_amount:'100',available_from:'2026-12-01',images:[]};
it('defaults to referential and explains the potential reduction in interest',async()=>{
 const save=vi.fn();render(<PublicationForm initial={rental} onSave={save}/>);
 expect(screen.getByRole('checkbox',{name:'¿Quieres que el pago de garantía sea obligatorio?'})).not.toBeChecked();
 expect(screen.getByText(/Marcar esta opción es opcional/)).toBeInTheDocument();
 expect(screen.getByText(/no se exige por adelantado/)).toBeInTheDocument();
 expect(screen.getByText(/puede reducir el interés/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({guarantee_required:false,guarantee_amount:'100'})));
});
it('restores the required flag and lets the owner save it as referential',async()=>{
 const save=vi.fn();render(<PublicationForm initial={{...rental,guarantee_required:true}} onSave={save}/>);
 const checkbox=screen.getByRole('checkbox',{name:'¿Quieres que el pago de garantía sea obligatorio?'});
 expect(checkbox).toBeChecked();fireEvent.click(checkbox);
 fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({guarantee_required:false})));
});
it('saves a required guarantee and rejects a zero amount',async()=>{
 const save=vi.fn();render(<PublicationForm initial={rental} onSave={save}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'¿Quieres que el pago de garantía sea obligatorio?'}));
 fireEvent.change(screen.getByLabelText('Garantía (S/)'),{target:{value:'0'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
 expect(await screen.findByRole('alert')).toHaveTextContent(/importe mayor a cero/);expect(save).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Garantía (S/)'),{target:{value:'100'}});
 fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({guarantee_required:true})));
});
it('removes the guarantee requirement when switching to sale',async()=>{
 const save=vi.fn();render(<PublicationForm initial={{...rental,guarantee_required:true}} onSave={save}/>);
 fireEvent.change(screen.getByLabelText('Modalidad'),{target:{value:'Venta'}});
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({guarantee_required:false,guarantee_amount:'0'})));
});
it('updates the receipt requirement immediately at the price or guarantee threshold',()=>{
 render(<PublicationForm initial={rental} onSave={vi.fn()}/>);
 const receipt=()=>screen.queryByRole('region',{name:'Boleta o comprobante'});
 expect(receipt()).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Precio (S/)'),{target:{value:'1000'}});
 expect(receipt()).toBeInTheDocument();expect(screen.getByText(/Boleta obligatoria:/)).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Precio (S/)'),{target:{value:'999.99'}});
 expect(receipt()).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Garantía (S/)'),{target:{value:'1000'}});
 expect(receipt()).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Garantía (S/)'),{target:{value:'999.99'}});
 expect(receipt()).not.toBeInTheDocument();
});
it('hides an existing receipt below the threshold without discarding it on save',async()=>{
 const save=vi.fn(),ref='/private-receipt';
 render(<PublicationForm initial={{...rental,price:'50',guarantee_amount:'100',provenance_evidence_ref:ref}} onSave={save}/>);
 expect(screen.queryByRole('region',{name:'Boleta o comprobante'})).not.toBeInTheDocument();
 expect(screen.getByText(/Tu comprobante anterior se conserva/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Guardar borrador'}));
 await waitFor(()=>expect(save).toHaveBeenCalledWith(expect.objectContaining({provenance_evidence_ref:ref})));
 fireEvent.change(screen.getByLabelText('Garantía (S/)'),{target:{value:'1000'}});
 expect(screen.getByRole('region',{name:'Boleta o comprobante'})).toHaveTextContent(ref);
 fireEvent.change(screen.getByLabelText('Modalidad'),{target:{value:'Venta'}});
 expect(screen.queryByRole('region',{name:'Boleta o comprobante'})).not.toBeInTheDocument();
});
