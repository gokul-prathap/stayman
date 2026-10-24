// Registered before BrowserRouter so a declined Back/Forward cannot unmount a draft.
let handler=null;
const dispatch=event=>handler?.(event);
if(typeof window!=='undefined')window.addEventListener('popstate',dispatch,true);
if(import.meta.hot)import.meta.hot.dispose(()=>window.removeEventListener('popstate',dispatch,true));
export function guardBrowserHistory(callback){handler=callback;return()=>{if(handler===callback)handler=null;};}
