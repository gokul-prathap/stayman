import {useId,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import './collapsible-card.css';
export default function CollapsibleCard({title,children,summary,defaultOpen=false}){
 const [open,setOpen]=useState(defaultOpen);
 const id=useId();
 return <section className="collapsible-card"><div className="collapsible-card-heading"><h2>{title}</h2>{summary&&<span className="collapsible-card-summary">{summary}</span>}<button type="button" className="card-edge-toggle" aria-label={(open?'Collapse ':'Expand ')+title} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><ChevronDown size={15} aria-hidden="true"/></button></div><div id={id} className="collapsible-card-content" hidden={!open}>{children}</div></section>;
}
