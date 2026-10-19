import test from 'node:test';
import assert from 'node:assert/strict';
import {documentTextResult} from '../src/features/rooms/utils/identityScreening.js';
import {DEFAULT_DOCUMENT_CROP,suggestDocumentCrop,suggestDocumentCorners,validDocumentCorners,squareToDocument,fullDocumentCorners,rectifyDocument} from '../src/features/rooms/utils/documentCrop.js';

test('rejects random photos, receipts and generic text even with high OCR confidence',()=>{
 for(const text of ['', 'A beautiful mountain and a lake in the forest', 'RECEIPT NAME Cafe DOB 01/01/2000 Total 1234567890', 'GOVERNMENT OF INDIA'])assert.equal(documentTextResult(text).accepted,false);
});
test('recognizes document text cues for supported ID fronts',()=>{
 for(const text of ['UNIQUE IDENTIFICATION AUTHORITY OF INDIA Name SAMPLE PERSON DOB 01/01/1990 1234 5678 9012','DRIVING LICENCE Name SAMPLE PERSON Date of Birth 01/01/1990 Valid until 2030','ELECTION COMMISSION OF INDIA ELECTOR Name SAMPLE PERSON Sex Female','PASSPORT Surname SAMPLE Nationality EXAMPLE Date of Birth 01/01/1990'])assert.equal(documentTextResult(text).accepted,true);
});
test('requires passport and visa respectively for foreign guest slots',()=>{
 const passport='PASSPORT Surname SAMPLE Nationality EXAMPLE Date of Birth 01/01/1990';
 const visa='VISA Name SAMPLE PERSON Expiry 01/01/2030';
 assert.equal(documentTextResult(passport,{foreign:true}).accepted,true);
 assert.equal(documentTextResult(passport,{foreign:true,side:'back'}).accepted,false);
 assert.equal(documentTextResult(visa,{foreign:true,side:'back'}).accepted,true);
 assert.equal(documentTextResult(visa,{foreign:true}).accepted,false);
});
test('accepts address-side ID text but rejects unreadable OCR',()=>{
 assert.equal(documentTextResult('Address SAMPLE PERSON CARE OF SAMPLE HOUSE EXAMPLE ROAD DISTRICT KERALA 682001',{side:'back'}).accepted,true);
 assert.equal(documentTextResult('GOVERNMENT OF INDIA Name SAMPLE PERSON DOB 01/01/1990',{confidence:12}).reason,'unreadable');
});
function image(width,height,rect){
 const pixels=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const inside=rect&&x>=rect[0]&&x<rect[2]&&y>=rect[1]&&y<rect[3];
  const offset=(y*width+x)*4;pixels.fill(inside?230:40,offset,offset+3);pixels[offset+3]=255;
 }
 return pixels;
}
test('suggests an inset crop around a contrasting document, with padding',()=>{
 const crop=suggestDocumentCrop(image(100,100,[15,25,85,75]),100,100);
 assert.ok(crop.x<.15&&crop.x>.1);assert.ok(crop.y<.25&&crop.y>.2);
 assert.ok(crop.x+crop.width>=.85);assert.ok(crop.y+crop.height>=.75);
});
test('falls back to a visible crop frame for blank photos and full-frame documents',()=>{
 assert.deepEqual(suggestDocumentCrop(image(100,100),100,100),DEFAULT_DOCUMENT_CROP);
 assert.deepEqual(suggestDocumentCrop(image(100,100,[0,0,100,100]),100,100),DEFAULT_DOCUMENT_CROP);
});
test('detects four distinct corners of a skewed document rather than its bounding box',()=>{
 const points=[{x:.2,y:.25},{x:.85,y:.1},{x:.95,y:.65},{x:.1,y:.85}],pixels=image(100,100);
 for(let y=0;y<100;y++)for(let x=0;x<100;x++){
  const point={x:x/100,y:y/100};
  const inside=points.every((a,i)=>{const b=points[(i+1)%4];return (b.x-a.x)*(point.y-a.y)-(b.y-a.y)*(point.x-a.x)>=0;});
  if(inside)pixels.fill(230,(y*100+x)*4,(y*100+x)*4+3);
 }
 const result=suggestDocumentCorners(pixels,100,100);
 assert.equal(result.detected,true);assert.equal(validDocumentCorners(result.corners),true);
 result.corners.forEach((point,i)=>{assert.ok(Math.abs(point.x-points[i].x)<.04);assert.ok(Math.abs(point.y-points[i].y)<.04);});
});
test('perspective mapping reaches all four selected corners and keeps the center inside',()=>{
 const corners=[{x:.2,y:.25},{x:.85,y:.1},{x:.95,y:.65},{x:.1,y:.85}],map=squareToDocument(corners);
 [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{
  const point=map(u,v);assert.ok(Math.abs(point.x-corners[i].x)<1e-9);assert.ok(Math.abs(point.y-corners[i].y)<1e-9);
 });
 assert.ok(map(.5,.5).x>.1&&map(.5,.5).x<.95);
 assert.deepEqual(squareToDocument(fullDocumentCorners())(.5,.5),{x:.5,y:.5});
});
test('rejects crossed, duplicated and out-of-image corners before warping',()=>{
 for(const corners of [[{x:0,y:0},{x:1,y:1},{x:1,y:0},{x:0,y:1}],Array(4).fill({x:.5,y:.5}),[{x:-.1,y:0},...fullDocumentCorners().slice(1)]]){
  assert.equal(validDocumentCorners(corners),false);assert.throws(()=>squareToDocument(corners));
 }
});
test('warps image pixels using the selected corners and releases the source bitmap',async()=>{
 const previousDocument=globalThis.document,previousBitmap=globalThis.createImageBitmap;
 let closed=false,output;
 const pixels=new Uint8ClampedArray(4*4*4);
 for(let y=0;y<4;y++)for(let x=0;x<4;x++){const i=(y*4+x)*4;pixels[i]=x*40;pixels[i+1]=y*40;pixels[i+3]=255;}
 globalThis.createImageBitmap=async()=>({width:4,height:4,close(){closed=true;}});
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){},getImageData:()=>({data:pixels}),createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),putImageData(data){output=data;}}),toBlob(callback){callback(new Blob(['test'],{type:'image/jpeg'}));}})};
 try{
  const points=[{x:.25,y:.25},{x:.75,y:.1},{x:.9,y:.9},{x:.1,y:.8}];
  assert.equal((await rectifyDocument(new Blob(),points)).type,'image/jpeg');
  assert.equal(output.data[0],30);assert.equal(output.data[1],30);
  const last=(output.width*output.height-1)*4;
  assert.equal(output.data[last],108);assert.equal(output.data[last+1],108);assert.equal(closed,true);
 }finally{globalThis.document=previousDocument;globalThis.createImageBitmap=previousBitmap;}
});
