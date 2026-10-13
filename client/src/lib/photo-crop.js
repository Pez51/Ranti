export const cropClamp = (value,min,max) => Math.min(max,Math.max(min,value));
export function photoCropRect(width,height,zoom,center) {
  const side=Math.min(width,height)/zoom;
  return {side,x:cropClamp(center.x*width-side/2,0,width-side),y:cropClamp(center.y*height-side/2,0,height-side)};
}
