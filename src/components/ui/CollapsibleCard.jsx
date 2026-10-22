import {useEffect,useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import './collapsible-card.css';
export default function CollapsibleCard({title,children,summary,defaultOpen=false,disabled=false}){
 const [open,setOpen]=useState(defaultOpen);
 const id=useId();
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const expanded=open&&!disabled;
 return <section className="collapsible-card"><div className="collapsible-card-heading"><h2>{title}</h2>{summary&&<span className="collapsible-card-summary">{summary}</span>}<button type="button" className="card-edge-toggle" disabled={disabled} title={disabled?'Web check-in completed and linked':undefined} aria-label={(expanded?'Collapse ':'Expand ')+title} aria-expanded={expanded} aria-controls={id} onClick={()=>setOpen(value=>!value)}><ChevronDown size={15} aria-hidden="true"/></button></div><div id={id} className="collapsible-card-content" hidden={!expanded}>{children}</div></section>;
}
