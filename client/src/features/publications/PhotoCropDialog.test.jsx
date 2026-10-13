import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import PhotoCropDialog from './PhotoCropDialog';
import { photoCropRect } from '../../lib/photo-crop';
const modalDescriptor=Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype,'showModal');
let drawImage;
beforeEach(()=>{
  vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:crop-test');
  vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(){this.setAttribute('open','');}});
  drawImage=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage});
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(callback=>callback(new Blob(['cropped'],{type:'image/webp'})));
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();if(modalDescriptor) Object.defineProperty(HTMLDialogElement.prototype,'showModal',modalDescriptor);else delete HTMLDialogElement.prototype.showModal;});
function setup(){
  const confirm=vi.fn(),cancel=vi.fn();render(<PhotoCropDialog blob={new Blob(['image'])} onConfirm={confirm} onCancel={cancel}/>);
  const image=screen.getByAltText('Vista previa del recorte');
  Object.defineProperties(image,{naturalWidth:{value:1200},naturalHeight:{value:800}});fireEvent.load(image);
  return {image,confirm,cancel};
}
it('keeps the crop within the image for landscape, portrait and edge positions',()=>{
  expect(photoCropRect(1200,800,1,{x:.5,y:.5})).toEqual({x:200,y:0,side:800});
  expect(photoCropRect(800,1200,2,{x:1,y:0})).toEqual({x:400,y:0,side:400});
});
it('exports precisely the zoomed crop shown in the preview',async()=>{
  const {image,confirm}=setup();
  fireEvent.change(screen.getByRole('slider',{name:'Zoom'}),{target:{value:'2'}});
  expect(image).toHaveStyle({width:'300%',height:'200%',left:'-100%',top:'-50%'});
  fireEvent.click(screen.getByRole('button',{name:'Usar este encuadre'}));
  await waitFor(()=>expect(confirm).toHaveBeenCalledOnce());
  expect(drawImage).toHaveBeenCalledWith(image,400,200,400,400,0,0,400,400);
});
it('supports keyboard positioning, resetting and cancellation',()=>{
  const {image,cancel}=setup();
  fireEvent.keyDown(screen.getByRole('group'),{key:'ArrowLeft'});
  expect(image).not.toHaveStyle({left:'-25%'});
  fireEvent.click(screen.getByRole('button',{name:'Centrar de nuevo'}));expect(image).toHaveStyle({left:'-25%'});
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));expect(cancel).toHaveBeenCalledOnce();
});
it('pans by dragging while keeping the crop inside image boundaries',()=>{
  vi.stubGlobal('PointerEvent',MouseEvent);
  const {image}=setup();const stage=screen.getByRole('group');
  vi.spyOn(stage,'getBoundingClientRect').mockReturnValue({width:400});
  fireEvent.pointerDown(stage,{clientX:100,clientY:100,button:0});
  fireEvent.pointerMove(stage,{clientX:200,clientY:100});fireEvent.pointerUp(stage);
  expect(image).toHaveStyle({left:'0%'});
});
