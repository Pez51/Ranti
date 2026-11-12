import { beforeEach,it,expect,vi } from 'vitest';
import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import IncidencePanel,{IncidenceCase} from './IncidencePanel';
import { apiRequest,apiBlob } from '../../lib/api';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn(),apiBlob:vi.fn()}));
const caseData={case:{id:'case-12345678',status:'Abierta',revision:1,type:'meeting',description:'No se concretó el encuentro.'},operation:{id:'op-1',title:'Router',modality:'Alquiler',status:'Aceptada',owner_id:'owner',requester_id:'buyer'},events:[{id:'1',actor_name:'Comprador',kind:'opened',body:'No se concretó el encuentro.',status:'Abierta',created_at:'2026-10-14T12:00:00Z'}],evidence:[],effect:{pending_count:1,closure_blocked:true,disbursement_blocked:true,money_notice:'Cierre y desembolso bloqueados.'}};
const list={items:[],policy:{allowed:true,reasons:[{id:'meeting',label:'Problemas con el encuentro'}],post_close_days:7},effect:caseData.effect};
beforeEach(()=>vi.resetAllMocks());
it('opens a report using server-provided reasons and displays private evidence and follow-up',async()=>{
 apiRequest.mockImplementation((path,options)=>Promise.resolve(options?.method==='POST'||path.startsWith('/incidences/')?caseData:list));
 render(<IncidencePanel operationId="op-1" token="token"/>);
 fireEvent.click(screen.getByRole('button',{name:'Reportar un problema'}));
 await screen.findByLabelText('Motivo del problema');
 fireEvent.change(screen.getByLabelText('Motivo del problema'),{target:{value:'meeting'}});
 fireEvent.change(screen.getByLabelText('Describe lo ocurrido'),{target:{value:'No pudimos reunirnos en el lugar acordado.'}});
 fireEvent.click(screen.getByRole('button',{name:'Abrir incidencia'}));
 await screen.findByRole('heading',{name:/Caso case-123 · Abierta/});
 expect(apiRequest).toHaveBeenCalledWith('/operations/op-1/incidences',expect.objectContaining({method:'POST',body:JSON.stringify({reason:'meeting',description:'No pudimos reunirnos en el lugar acordado.'})}));
 expect(screen.getByLabelText('Evidencias (fotos o PDF)')).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Guardar actuación administrativa'})).not.toBeInTheDocument();
});
it('sends a participant reply with the current revision and cannot resolve a case',async()=>{
 apiRequest.mockResolvedValueOnce(caseData).mockResolvedValueOnce({...caseData,case:{...caseData.case,revision:2}});
 render(<IncidenceCase id={caseData.case.id} token="token"/>);
 await screen.findByLabelText('Respuesta o información del caso');
 fireEvent.change(screen.getByLabelText('Respuesta o información del caso'),{target:{value:'Propongo coordinar nuevamente.'}});
 fireEvent.click(screen.getByRole('button',{name:'Enviar respuesta'}));
 await screen.findByText('Respuesta guardada.');
 expect(apiRequest).toHaveBeenLastCalledWith('/incidences/case-12345678/replies',expect.objectContaining({body:JSON.stringify({revision:1,body:'Propongo coordinar nuevamente.'})}));
 expect(screen.queryByLabelText('Decisión')).not.toBeInTheDocument();
});
it('records an explicit administrative decision without presenting it as a refund',async()=>{
 apiRequest.mockResolvedValueOnce(caseData).mockResolvedValueOnce({...caseData,case:{...caseData.case,status:'Resuelta',resolution_action:'record_only',resolution_notes:'Información registrada, sin movimientos económicos.'},effect:{...caseData.effect,closure_blocked:false,pending_count:0}});
 render(<IncidenceCase id={caseData.case.id} token="admin-token" admin/>);
 await screen.findByLabelText('Actuación');
 fireEvent.change(screen.getByLabelText('Actuación'),{target:{value:'resolve'}});
 fireEvent.change(screen.getByLabelText('Respuesta o información del caso'),{target:{value:'Información registrada, sin movimientos económicos.'}});
 expect(screen.getByText(/Resolver no ejecuta reembolsos/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Guardar actuación administrativa'}));
 await screen.findByText(/Decisión registrada:/);
 expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({action:'resolve',decision:'record_only',revision:1});
 expect(screen.queryByLabelText('Respuesta o información del caso')).not.toBeInTheDocument();
});
it('downloads evidence only with an authenticated request and preserves errors for retry',async()=>{
 apiRequest.mockResolvedValue({...caseData,evidence:[{id:'file-1',name:'Prueba.pdf'}]});apiBlob.mockRejectedValue(new Error('Acceso denegado.'));
 render(<IncidenceCase id={caseData.case.id} token="token"/>);
 fireEvent.click(await screen.findByRole('button',{name:'Descargar Prueba.pdf'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Acceso denegado.');
 expect(apiBlob).toHaveBeenCalledWith('/incidences/case-12345678/evidence/file-1',{token:'token'});
});
it('uploads PDF evidence to the case and refreshes its revision',async()=>{
 apiRequest.mockResolvedValueOnce(caseData).mockResolvedValueOnce({id:'file-1'}).mockResolvedValueOnce({...caseData,case:{...caseData.case,revision:2},evidence:[{id:'file-1',name:'Prueba.pdf'}]});
 render(<IncidenceCase id={caseData.case.id} token="token"/>);
 const file=new File(['%PDF-1.4\n%%EOF'],'Prueba.pdf',{type:'application/pdf'});
 fireEvent.change(await screen.findByLabelText('Evidencias (fotos o PDF)'),{target:{files:[file]}});
 fireEvent.click(screen.getByRole('button',{name:'Adjuntar evidencias'}));
 expect(await screen.findByText('Evidencias adjuntas.')).toBeInTheDocument();
 await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('/incidences/case-12345678/evidence',expect.objectContaining({token:'token',method:'POST',body:file,headers:{'Content-Type':'application/pdf','X-File-Name':'Prueba.pdf'}})));
 expect(await screen.findByRole('button',{name:'Descargar Prueba.pdf'})).toBeInTheDocument();
});
it('explains expired reporting windows and an already recorded disbursement',async()=>{
 apiRequest.mockResolvedValue({...list,policy:{...list.policy,allowed:false,report_deadline:'2026-10-08T12:00:00Z'},effect:{money_notice:'El desembolso ya figura registrado. Este reporte no lo revierte automáticamente.'}});
 render(<IncidencePanel operationId="op-1" token="token"/>);fireEvent.click(screen.getByRole('button',{name:'Reportar un problema'}));
 expect(await screen.findByText(/No se admiten nuevos reportes/)).toBeInTheDocument();
 expect(screen.getByText(/no lo revierte automáticamente/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Abrir incidencia'})).not.toBeInTheDocument();
});
it('reports failed delivery with a factual timestamp and evidence in the same submission flow',async()=>{
 const reason={id:'delivery_absence',label:'El oferente no se presentó'};
 const updatedCase={...caseData,case:{...caseData.case,type:reason.id}};
 apiRequest.mockImplementation((path,options)=>Promise.resolve(options?.method==='POST'||path.startsWith('/incidences/')?updatedCase:{...list,policy:{...list.policy,reasons:[reason]}}));
 render(<IncidencePanel operationId="op-1" token="token" request={{reason:reason.id}}/>);
 await screen.findByLabelText('Fecha y hora del hecho (Perú)');
 fireEvent.change(screen.getByLabelText('Describe lo ocurrido'),{target:{value:'Esperé en el punto acordado y el oferente no llegó.'}});
 fireEvent.change(screen.getByLabelText('Fecha y hora del hecho (Perú)'),{target:{value:'2026-10-14T07:00'}});
 const submit=screen.getByRole('button',{name:'Enviar reporte de incumplimiento'});
 expect(submit).toBeDisabled();
 const file=new File(['%PDF-1.4\n%%EOF'],'Encuentro.pdf',{type:'application/pdf'});
 fireEvent.change(screen.getByLabelText('Evidencia del reporte'),{target:{files:[file]}});
 fireEvent.click(submit);
 await screen.findByRole('heading',{name:/Caso case-123 · Abierta/});
 expect(apiRequest).toHaveBeenCalledWith('/operations/op-1/incidences',expect.objectContaining({
  method:'POST',body:JSON.stringify({reason:reason.id,description:'Esperé en el punto acordado y el oferente no llegó.',occurred_at:'2026-10-14T12:00:00.000Z'})
 }));
 expect(apiRequest).toHaveBeenCalledWith('/incidences/case-12345678/evidence',expect.objectContaining({method:'POST',body:file}));
});

it('sends a guarantee dismissal with zero retention after reviewing the amounts and destinations', async () => {
 const settlement={held:'200.00',proposed:{owner:'80.00',buyer:'120.00',excess:'0.00'},buyer_destination:'Tarjeta original',owner_destination:{label:'Banco de prueba',last_four:'8901'}};
 const guaranteeCase={...caseData,case:{...caseData.case,type:'guarantee'},return_settlement:settlement};
 apiRequest.mockResolvedValueOnce(guaranteeCase).mockResolvedValueOnce({...guaranteeCase,case:{...guaranteeCase.case,status:'Resuelta'}});
 render(<IncidenceCase id={caseData.case.id} token="admin-token" admin/>);
 fireEvent.change(await screen.findByLabelText('Actuación'),{target:{value:'resolve'}});
 fireEvent.change(screen.getByLabelText('Decisión'),{target:{value:'settle_guarantee'}});
 fireEvent.change(screen.getByLabelText('¿Procede la pretensión de garantía?'),{target:{value:'proceeds'}});
 fireEvent.change(screen.getByLabelText('Importe aprobado para el oferente (S/)'),{target:{value:'80.00'}});
 fireEvent.change(screen.getByLabelText('¿Procede la pretensión de garantía?'),{target:{value:'dismissed'}});
 expect(screen.getByLabelText('Importe aprobado para el oferente (S/)')).toHaveValue('0.00');
 expect(screen.getByText('S/ 200.00',{selector:'dd'})).toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Respuesta o información del caso'),{target:{value:'El acta y las fotos muestran que el cable no presenta daño.'}});
 fireEvent.click(screen.getByRole('button',{name:'Revisar resolución y destinos'}));
 const confirm=screen.getByRole('button',{name:'Confirmar importes y destinos de prueba'});
 expect(confirm).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:'Revisé los importes, las evidencias y los destinos.'}));
 fireEvent.click(confirm);
 await screen.findByRole('heading',{name:/Caso case-123 · Resuelta/});
 expect(JSON.parse(apiRequest.mock.calls[1][1].body)).toMatchObject({decision:'settle_guarantee',guarantee_outcome:'dismissed',retention_cents:'0'});
});
