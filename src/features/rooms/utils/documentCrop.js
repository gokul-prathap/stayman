export const DEFAULT_DOCUMENT_CROP={x:0.025,y:0.025,width:0.95,height:0.95};

// Suggest a bright document region on a contrasting surface. If edges are not
// clear, retain an adjustable inset frame instead of claiming edge detection.
function findDocumentRegion(pixels,width,height) {
 const seen=new Uint8Array(width*height),queue=new Int32Array(width*height);
 let best=null;
 const bright=index=>{
  const offset=index*4,r=pixels[offset],g=pixels[offset+1],b=pixels[offset+2];
  return (r+g+b)/3>155&&Math.max(r,g,b)-Math.min(r,g,b)<65;
 };
 for(let index=0;index<seen.length;index++){
  if(seen[index]||!bright(index))continue;
  let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;
  const corners=[null,null,null,null],scores=[Infinity,-Infinity,-Infinity,Infinity];
  queue[0]=index;seen[index]=1;
  while(head<tail){
   const point=queue[head++],x=point%width,y=Math.floor(point/width);
   minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   if(x+y<scores[0]){scores[0]=x+y;corners[0]={x:x/width,y:y/height};}
   if(x-y>scores[1]){scores[1]=x-y;corners[1]={x:x/width,y:y/height};}
   if(x+y>scores[2]){scores[2]=x+y;corners[2]={x:x/width,y:y/height};}
   if(x-y<scores[3]){scores[3]=x-y;corners[3]={x:x/width,y:y/height};}
   for(const next of [x>0?point-1:-1,x<width-1?point+1:-1,y>0?point-width:-1,y<height-1?point+width:-1]){
    if(next>=0&&!seen[next]&&bright(next)){seen[next]=1;queue[tail++]=next;}
   }
  }
  const boxWidth=maxX-minX+1,boxHeight=maxY-minY+1,area=boxWidth*boxHeight,fraction=area/(width*height),ratio=boxWidth/boxHeight;
  if(fraction>.15&&fraction<.9&&tail/area>.45&&ratio>.45&&ratio<2.5&&(!best||area>best.area))best={minX,minY,maxX,maxY,area,corners};
 }
 return best;
}
export function suggestDocumentCrop(pixels,width,height) {
 const best=findDocumentRegion(pixels,width,height);
 if(!best)return {...DEFAULT_DOCUMENT_CROP};
 const x=Math.max(0,best.minX/width-.02),y=Math.max(0,best.minY/height-.02);
 return {x,y,width:Math.min(1,(best.maxX+1)/width+.02)-x,height:Math.min(1,(best.maxY+1)/height+.02)-y};
}

export const fullDocumentCorners=()=>[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
export const defaultDocumentCorners=()=>[{x:.025,y:.025},{x:.975,y:.025},{x:.975,y:.975},{x:.025,y:.975}];
export function validDocumentCorners(points) {
 if(!Array.isArray(points)||points.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))return false;
 for(let i=0;i<4;i++){
  const a=points[i],b=points[(i+1)%4],c=points[(i+2)%4];
  if((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x)<.001)return false;
 }
 return true;
}
export function suggestDocumentCorners(pixels,width,height) {
 const region=findDocumentRegion(pixels,width,height);
 if(!region||!validDocumentCorners(region.corners))return {corners:defaultDocumentCorners(),detected:false};
 // Small outward padding protects text printed close to the physical edge.
 const center=region.corners.reduce((a,p)=>({x:a.x+p.x/4,y:a.y+p.y/4}),{x:0,y:0});
 const corners=region.corners.map(p=>({x:Math.max(0,Math.min(1,center.x+(p.x-center.x)*1.04)),y:Math.max(0,Math.min(1,center.y+(p.y-center.y)*1.04))}));
 return {corners,detected:validDocumentCorners(corners)};
}
export function documentCornersFromImage(image) {
 const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)return {corners:defaultDocumentCorners(),detected:false};
 context.drawImage(image,0,0,canvas.width,canvas.height);
 return suggestDocumentCorners(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
}

export function squareToDocument(points) {
 if(!validDocumentCorners(points))throw new Error('Keep four corners around the document without crossing the edges.');
 const [p0,p1,p2,p3]=points;
 const sx=p0.x-p1.x+p2.x-p3.x,sy=p0.y-p1.y+p2.y-p3.y;
 const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y;
 const denominator=dx1*dy2-dx2*dy1;
 const g=Math.abs(sx)+Math.abs(sy)<1e-10?0:(sx*dy2-dx2*sy)/denominator;
 const h=Math.abs(sx)+Math.abs(sy)<1e-10?0:(dx1*sy-sx*dy1)/denominator;
 return (u,v)=>{
  const divisor=g*u+h*v+1;
  return {x:((p1.x-p0.x+g*p1.x)*u+(p3.x-p0.x+h*p3.x)*v+p0.x)/divisor,
   y:((p1.y-p0.y+g*p1.y)*u+(p3.y-p0.y+h*p3.y)*v+p0.y)/divisor};
 };
}

export async function rectifyDocument(file,corners) {
 const transform=squareToDocument(corners),bitmap=await createImageBitmap(file);
 try {
  const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));
  const source=document.createElement('canvas');source.width=Math.max(1,Math.round(bitmap.width*scale));source.height=Math.max(1,Math.round(bitmap.height*scale));
  const context=source.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Your browser cannot process this photo.');
  context.drawImage(bitmap,0,0,source.width,source.height);
  const pixels=context.getImageData(0,0,source.width,source.height).data;
  const length=(a,b)=>Math.hypot((a.x-b.x)*source.width,(a.y-b.y)*source.height);
  const width=Math.max(length(corners[0],corners[1]),length(corners[3],corners[2]));
  const height=Math.max(length(corners[0],corners[3]),length(corners[1],corners[2]));
  const outputScale=Math.min(1,1500/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(width*outputScale));canvas.height=Math.max(2,Math.round(height*outputScale));
  const target=canvas.getContext('2d');if(!target)throw new Error('Your browser cannot process this photo.');
  const image=target.createImageData(canvas.width,canvas.height);
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){
   const point=transform(x/(canvas.width-1),y/(canvas.height-1));
   const sx=Math.max(0,Math.min(source.width-1,point.x*(source.width-1))),sy=Math.max(0,Math.min(source.height-1,point.y*(source.height-1)));
   const x0=Math.floor(sx),y0=Math.floor(sy),x1=Math.min(source.width-1,x0+1),y1=Math.min(source.height-1,y0+1),fx=sx-x0,fy=sy-y0;
   const offset=(y*canvas.width+x)*4;
   for(let channel=0;channel<3;channel++)image.data[offset+channel]=pixels[(y0*source.width+x0)*4+channel]*(1-fx)*(1-fy)+pixels[(y0*source.width+x1)*4+channel]*fx*(1-fy)+pixels[(y1*source.width+x0)*4+channel]*(1-fx)*fy+pixels[(y1*source.width+x1)*4+channel]*fx*fy;
   image.data[offset+3]=255;
  }
  target.putImageData(image,0,0);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
  if(!blob)throw new Error('Could not straighten this photo. Please try another image.');
  return blob;
 }finally{bitmap.close();}
}

export function cropFromImage(image) {
 const scale=Math.min(1,320/Math.max(image.naturalWidth,image.naturalHeight));
 const canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
 const context=canvas.getContext('2d',{willReadFrequently:true});
 if(!context)return {...DEFAULT_DOCUMENT_CROP};
 context.drawImage(image,0,0,canvas.width,canvas.height);
 return suggestDocumentCrop(context.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
}
