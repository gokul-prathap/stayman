import {useEffect,useRef,useState} from 'react';
import {RotateCcw,RotateCw} from 'lucide-react';

export default function RotatableDocumentImage({src,label,onError}) {
 const [rotation,setRotation]=useState(0),[size,setSize]=useState({width:1,height:1}),[width,setWidth]=useState(280);
 const frame=useRef(null);
 useEffect(()=>{setRotation(0);},[src]);
 useEffect(()=>{
  const update=()=>setWidth(frame.current?.clientWidth||280);
  update();const observer=new ResizeObserver(update);observer.observe(frame.current);
  return()=>observer.disconnect();
 },[]);
 const sideways=rotation%2!==0;
 const scale=Math.min(width/(sideways?size.height:size.width),288/(sideways?size.width:size.height));
 return <div><div ref={frame} className="relative h-72 w-full overflow-hidden rounded-lg border bg-slate-50"><img src={src} alt={label} onError={onError} onLoad={event=>setSize({width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight})} style={{position:'absolute',left:'50%',top:'50%',width:size.width*scale,height:size.height*scale,maxWidth:'none',transform:`translate(-50%,-50%) rotate(${rotation*90}deg)`}}/></div><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="secondary flex items-center gap-1" aria-label={'Rotate '+label+' left'} onClick={()=>setRotation(value=>(value+3)%4)}><RotateCcw size={16}/>Rotate left</button><button type="button" className="secondary flex items-center gap-1" aria-label={'Rotate '+label+' right'} onClick={()=>setRotation(value=>(value+1)%4)}><RotateCw size={16}/>Rotate right</button></div></div>;
}
