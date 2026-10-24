import React,{createContext,useContext,useEffect,useRef,useState,useCallback,useMemo} from 'react';
import {useLocation} from 'react-router-dom';
import {guardBrowserHistory} from '../../services/navigationGuard';
const DirtyContext=createContext({setDirty:()=>{},confirmLeave:()=>true});
export const useAdminDrafts=()=>useContext(DirtyContext);
export function AdminDraftGuard({children}){
 const dirty=useRef(new Map()),location=useLocation(),lastPath=useRef(location.pathname+location.search+location.hash),lastIndex=useRef(window.history.state?.idx??0),restoring=useRef(false);
 const setDirty=useCallback((key,value)=>dirty.current.set(key,value),[]);
 const confirmLeave=useCallback(()=>![...dirty.current.values()].some(Boolean)||window.confirm('You have unsaved changes. Leave this page? Changes are kept only while this property workspace stays open.'),[]);
 useEffect(()=>{lastPath.current=location.pathname+location.search+location.hash;lastIndex.current=window.history.state?.idx??0;},[location]);
 useEffect(()=>{const unload=e=>{if([...dirty.current.values()].some(Boolean)){e.preventDefault();e.returnValue='';}};
  const back=e=>{if(restoring.current){restoring.current=false;e.stopImmediatePropagation();return;}if(confirmLeave())return;
   // Intercept before BrowserRouter unmounts the edited workspace, then return to its history entry.
   e.stopImmediatePropagation();const delta=lastIndex.current-(window.history.state?.idx??0);
   if(delta){restoring.current=true;window.history.go(delta);}else window.history.replaceState(window.history.state,'',lastPath.current);
  };
  const unsubscribe=guardBrowserHistory(back);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener('beforeunload',unload);unsubscribe();};},[confirmLeave]);
 return <DirtyContext.Provider value={useMemo(()=>({setDirty,confirmLeave}),[setDirty,confirmLeave])}><div onClickCapture={e=>{const a=e.target.closest?.('a[href]');if(!a||a.target==='_blank')return;const url=new URL(a.href,window.location.href);if(url.pathname+url.search===location.pathname+location.search)return;if(!confirmLeave()){e.preventDefault();e.stopPropagation();}}}>{children}</div></DirtyContext.Provider>;
}
export default function AdminSection({property='platform',id,title,description,summary,children,defaultOpen=true,error}){
 const key='stayman-admin-section:'+property+':'+id;
 const [open,setOpen]=useState(()=>{try{const saved=localStorage.getItem(key);return saved===null?defaultOpen:saved==='true';}catch{return defaultOpen;}}),[hasError,setHasError]=useState(false);
 const ref=useRef(null);
 useEffect(()=>{const node=ref.current;const scan=()=>setHasError(!!node?.querySelector('.error,[role="alert"]'));const observer=new MutationObserver(scan);if(node)observer.observe(node,{subtree:true,childList:true,characterData:true});scan();return()=>observer.disconnect();},[]);
 return <details ref={ref} className="admin-disclosure" open={open} onInvalidCapture={()=>{if(ref.current)ref.current.open=true;setOpen(true);}} onToggle={e=>{const value=e.currentTarget.open;setOpen(value);try{localStorage.setItem(key,String(value));}catch{}}}><summary><div><h2>{title}</h2>{description&&<p>{description}</p>}</div><span className="admin-section-summary">{error||hasError?<strong className="admin-attention">Needs attention</strong>:summary}<span aria-hidden="true" className="admin-disclosure-arrow">⌄</span></span></summary><div className="admin-disclosure-body">{children}</div></details>;
}
