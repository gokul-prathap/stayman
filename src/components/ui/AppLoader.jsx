import {useEffect,useState} from 'react';
import './app-loader.css';
const messages=['Getting things ready for you.','Bringing your workspace together.','Just a moment, we’re on it.'];
export default function AppLoader({label='Loading Stayman',fullPage=false}){
 const [step,setStep]=useState(0),[slow,setSlow]=useState(false),[offline,setOffline]=useState(()=>!navigator.onLine);
 useEffect(()=>{
  const rotate=setInterval(()=>setStep(value=>(value+1)%messages.length),3000);
  const delay=setTimeout(()=>setSlow(true),8000);
  const update=()=>setOffline(!navigator.onLine);
  window.addEventListener('online',update);window.addEventListener('offline',update);
  return()=>{clearInterval(rotate);clearTimeout(delay);window.removeEventListener('online',update);window.removeEventListener('offline',update);};
 },[]);
 const message=offline?'You’re offline. Reconnect to continue.':slow?'Taking longer than usual. Your connection or the server may be slow.':messages[step];
 return <div className={'app-loader'+(fullPage?' app-loader-full':'')} role="status" aria-live="polite" aria-atomic="true"><span className="app-loader-dots" aria-hidden="true"><i/><i/><i/></span><strong>{label.replace(/[.…]+$/u,'')}</strong><p>{message}</p></div>;
}
