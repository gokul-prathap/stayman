import {useEffect,useState} from 'react';

// Query intervals must stop for both hidden tabs and disconnected clients.
export function useVisiblePolling(interval) {
 const [active,setActive]=useState(()=>document.visibilityState==='visible'&&navigator.onLine);
 useEffect(()=>{
  const update=()=>setActive(document.visibilityState==='visible'&&navigator.onLine);
  document.addEventListener('visibilitychange',update);
  window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);
 return active?interval:false;
}
