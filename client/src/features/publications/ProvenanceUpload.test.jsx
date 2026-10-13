import { beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import ProvenanceUpload from './ProvenanceUpload';
import { apiRequest } from '../../lib/api';
import { preparePhoto } from '../../lib/prepare-photo';
vi.mock('../../lib/api',async original=>({...await original(),apiRequest:vi.fn()}));
vi.mock('../../lib/prepare-photo',()=>({preparePhoto:vi.fn()}));
beforeEach(()=>{vi.resetAllMocks();});
const ref='/api/publications/provenance/11111111-1111-4111-8111-111111111111';
it('uploads a PDF as binary and stores only the private server reference',async()=>{
  apiRequest.mockResolvedValueOnce({ref});const change=vi.fn(),processing=vi.fn();
  render(<ProvenanceUpload value={null} onChange={change} onProcessing={processing}/>);
  const file=new File(['%PDF-1.4\n%%EOF'],'boleta.pdf',{type:'application/pdf'});
  fireEvent.change(screen.getByLabelText('Seleccionar boleta o comprobante'),{target:{files:[file]}});
  await waitFor(()=>expect(change).toHaveBeenCalledWith(ref));
  expect(apiRequest).toHaveBeenCalledWith('/publications/provenance',expect.objectContaining({method:'POST',headers:{'Content-Type':'application/pdf'},body:file}));
  expect(preparePhoto).not.toHaveBeenCalled();expect(processing).toHaveBeenLastCalledWith(false);
});
it('compresses a camera photo before uploading it',async()=>{
  const prepared=new Blob(['small'],{type:'image/webp'});preparePhoto.mockResolvedValueOnce(prepared);apiRequest.mockResolvedValueOnce({ref});
  const change=vi.fn();render(<ProvenanceUpload onChange={change} onProcessing={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Tomar foto de la boleta'),{target:{files:[new File(['raw'],'boleta.jpg',{type:'image/jpeg'})]}});
  await waitFor(()=>expect(change).toHaveBeenCalledWith(ref));
  expect(apiRequest.mock.calls[0][1]).toMatchObject({body:prepared,headers:{'Content-Type':'image/webp'}});
});
it('rejects oversized PDFs without replacing the previous receipt',async()=>{
  const change=vi.fn();render(<ProvenanceUpload value={ref} onChange={change} onProcessing={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar boleta o comprobante'),{target:{files:[new File([new Uint8Array(5*1024*1024+1)],'boleta.pdf',{type:'application/pdf'})]}});
  expect(await screen.findByRole('alert')).toHaveTextContent('máximo 5 MB');expect(change).not.toHaveBeenCalled();expect(apiRequest).not.toHaveBeenCalled();
});
it('preserves the existing reference if upload fails',async()=>{
  apiRequest.mockRejectedValueOnce(new Error('Sin conexión'));const change=vi.fn();render(<ProvenanceUpload value={ref} onChange={change} onProcessing={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('Seleccionar boleta o comprobante'),{target:{files:[new File(['%PDF-1.4\n%%EOF'],'boleta.pdf',{type:'application/pdf'})]}});
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión');expect(change).not.toHaveBeenCalled();
});
