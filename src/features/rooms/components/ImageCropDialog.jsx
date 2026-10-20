import {useEffect,useRef,useState} from 'react';
import {Crop,RotateCcw,RotateCw,X} from 'lucide-react';
import Button from '../../../components/ui/Button';
import DocumentPreview from './DocumentPreview';
import {defaultDocumentCorners,fullDocumentCorners,documentCornersFromImage,validDocumentCorners} from '../utils/documentCrop';
import {rotateIdentityPhoto} from '../utils/identityImage';

export default function ImageCropDialog({file,label,busy,error,onApply,onCancel,reviewRequired,reviewPhoto,onManualReview,onCropChange}) {
 const [url,setUrl]=useState(''),[corners,setCorners]=useState(defaultDocumentCorners),[loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[detected,setDetected]=useState(false);
 const [rotation,setRotation]=useState(0),[rotating,setRotating]=useState(false),[rotationError,setRotationError]=useState('');
 const stage=useRef(null),image=useRef(null),dragging=useRef(null),dialog=useRef(null),close=useRef(null);
 useEffect(()=>{
  setRotation(0);
  const previous=document.activeElement,overflow=document.body.style.overflow;document.body.style.overflow='hidden';close.current?.focus();
  return()=>{document.body.style.overflow=overflow;previous?.focus?.();};
 },[file]);
 useEffect(()=>{
  let active=true,objectUrl;
  setRotating(true);setLoaded(false);setFailed(false);setRotationError('');setUrl('');
  rotateIdentityPhoto(file,rotation).then(photo=>{
   if(!active)return;objectUrl=URL.createObjectURL(photo);setUrl(objectUrl);
  }).catch(err=>{if(active){setRotationError(err.message);setFailed(true);}}).finally(()=>{if(active)setRotating(false);});
  return()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[file,rotation]);
 function rotate(direction){
  if(busy||rotating||!loaded)return;
  onCropChange?.();dragging.current=null;setLoaded(false);setRotation(previous=>(previous+direction+4)%4);
 }
 function detect(){
  onCropChange?.();
  try{const result=documentCornersFromImage(image.current);setCorners(result.corners);setDetected(result.detected);}
  catch{setCorners(defaultDocumentCorners());setDetected(false);}
 }
 function move(event){
  if(dragging.current===null||busy||rotating)return;
  onCropChange?.();
  const box=stage.current.getBoundingClientRect(),index=dragging.current;
  const point={x:Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)),y:Math.max(0,Math.min(1,(event.clientY-box.top)/box.height))};
  setCorners(previous=>previous.map((p,i)=>i===index?point:p));
 }
 function keyDown(event){
  if(event.key==='Escape'&&!busy){event.preventDefault();onCancel();}
  if(event.key!=='Tab')return;
  const items=[...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
  if(!items.length){event.preventDefault();return;}
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
 const valid=validDocumentCorners(corners),outline=corners.map(p=>`${p.x*100},${p.y*100}`).join(' ');
 return <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 backdrop-blur-sm sm:items-center sm:p-6"><div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="crop-title" onKeyDown={keyDown} className="max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl sm:p-6">
 <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase text-slate-400">{label}</p><h2 id="crop-title" className="mt-1 flex items-center gap-2 text-xl font-bold"><Crop size={20}/>Crop and straighten ID</h2></div><button ref={close} type="button" disabled={busy} onClick={onCancel} aria-label="Close crop editor" className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100"><X size={20}/></button></div>
 <p className="my-3 text-sm text-slate-500">{detected?'Four corners detected. Check they follow the document edges.':'Drag the four handles onto the corners of your ID.'} The document will be cropped and straightened automatically.</p>
 <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-xl bg-slate-900 p-3"><div ref={stage} className="relative max-w-full touch-none select-none" onPointerMove={move} onPointerUp={event=>{move(event);dragging.current=null;}} onPointerCancel={()=>{dragging.current=null;}}>
 {url&&<img ref={image} src={url} alt={label+' original'} draggable={false} onLoad={()=>{detect();setLoaded(true);}} onError={()=>setFailed(true)} className="max-h-[38dvh] max-w-full object-contain"/>}
 {loaded&&<><svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={'M0 0 H100 V100 H0 Z M'+corners.map(p=>p.x*100+' '+p.y*100).join(' L')+' Z'} fill="rgba(15,23,42,.55)" fillRule="evenodd"/><polygon points={outline} fill="none" stroke="var(--theme-border-528cef87,white)" strokeWidth=".6"/></svg>{corners.map((p,index)=><button key={index} type="button" aria-label={['Top left','Top right','Bottom right','Bottom left'][index]+' corner. Use arrow keys to adjust.'} disabled={busy} style={{left:p.x*100+'%',top:p.y*100+'%',transform:'translate(-50%,-50%)'}} className="absolute flex h-11 w-11 items-center justify-center rounded-full focus:outline focus:outline-2 focus:outline-blue-400" onPointerDown={event=>{event.preventDefault();dragging.current=index;event.currentTarget.setPointerCapture(event.pointerId);}} onKeyDown={event=>{
  const delta={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]}[event.key];
  if(delta){event.preventDefault();onCropChange?.();setCorners(previous=>previous.map((point,i)=>i===index?{x:Math.max(0,Math.min(1,point.x+delta[0])),y:Math.max(0,Math.min(1,point.y+delta[1]))}:point));}
 }}><span className="h-4 w-4 rounded-full border-2 border-blue-600 bg-white shadow"/></button>)}</>}
 </div></div>
 {!valid&&<p role="alert" className="mt-3 text-sm text-red-600">Keep the corners in order without crossing the edges.</p>}
 {failed&&<p role="alert" className="mt-3 text-sm text-red-600">This photo cannot be opened. Please choose another.</p>}
 {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
 {rotationError&&<p role="alert" className="mt-3 text-sm text-red-600">{rotationError}</p>}
 {rotating&&<p role="status" className="mt-3 text-sm text-slate-500">Rotating photo...</p>}
 {reviewRequired&&<div role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{reviewPhoto&&<DocumentPreview blob={reviewPhoto} label="Cropped document for reception review"/>}<p>We could not confirm the document automatically. You can adjust the crop or retake the photo. If this is your ID, send it for reception to review and bring the original.</p><Button type="button" variant="secondary" disabled={busy} onClick={onManualReview} className="mt-3 w-full">Use this photo · Reception review required</Button></div>}
 <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={busy||rotating||!loaded} onClick={()=>rotate(-1)} aria-label="Rotate ID left" className="flex items-center gap-1"><RotateCcw size={16}/>Left</Button><Button type="button" variant="secondary" disabled={busy||rotating||!loaded} onClick={()=>rotate(1)} aria-label="Rotate ID right" className="flex items-center gap-1"><RotateCw size={16}/>Right</Button><Button type="button" variant="secondary" disabled={busy||!loaded} onClick={detect}>Find corners</Button><Button type="button" variant="secondary" disabled={busy} onClick={()=>{onCropChange?.();setCorners(fullDocumentCorners());setDetected(false);}} className="flex items-center gap-1"><RotateCcw size={15}/>Whole ID</Button><Button type="button" disabled={busy||rotating||!loaded||failed||!valid} onClick={()=>onApply({corners,rotation})} className="flex-1">{busy?'Checking document...':'Crop and check ID'}</Button></div>
 </div></div>;
}
