import {useEffect,useRef} from 'react';

export function useAnimationActivity(){
 const ref=useRef(null);
 useEffect(()=>{
  const node=ref.current;if(!node)return;
  let inView=true;
  const update=()=>{node.dataset.paused=String(!inView||document.visibilityState!=='visible');};
  const observer=new IntersectionObserver(([entry])=>{inView=entry.isIntersecting;update();});
  observer.observe(node);document.addEventListener('visibilitychange',update);update();
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',update);};
 },[]);
 return ref;
}
