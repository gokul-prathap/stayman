import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {ChevronDown,Search,Check} from 'lucide-react';
import {phoneCountries} from '../utils/phoneInput';
import './phone-country-picker.css';

// Packaged assets: no emoji font support, CDN or guest data sent to a flag service.
const flags=import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg',{eager:true,query:'?url',import:'default'});
const flag=country=>flags['/node_modules/flag-icons/flags/4x3/'+country.toLowerCase()+'.svg'];
export default function PhoneCountryPicker({country,onChange,label='Phone country code'}){
 const [open,setOpen]=useState(false),[term,setTerm]=useState(''),[active,setActive]=useState(0),[position,setPosition]=useState({});
 const button=useRef(null),panel=useRef(null),search=useRef(null),id=useId();
 const selected=phoneCountries.find(item=>item.country===country)||phoneCountries.find(item=>item.country==='IN');
 const query=term.trim().toLowerCase().replace(/^\+/,''),options=phoneCountries.filter(item=>!query||item.name.toLowerCase().includes(query)||item.code.startsWith(query)||item.country.toLowerCase()===query);
 const close=(focus=true)=>{setOpen(false);if(focus)button.current?.focus();};
 function choose(item){if(item.country!==country)onChange(item.country);close();}
 function place(){
  const rect=button.current.getBoundingClientRect(),width=Math.min(340,window.innerWidth-24),below=window.innerHeight-rect.bottom-12,above=rect.top-12,up=below<240&&above>below,height=Math.min(360,Math.max(120,up?above:below));
  setPosition({width,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),top:up?Math.max(12,rect.top-height-6):rect.bottom+6,maxHeight:height});
 }
 function show(){setTerm('');setActive(Math.max(0,phoneCountries.findIndex(item=>item.country===country)));place();setOpen(true);}
 useEffect(()=>{
  if(!open)return;search.current?.focus();
  const outside=event=>{if(!panel.current?.contains(event.target)&&!button.current?.contains(event.target))close(false);};
  const key=event=>{if(event.key==='Escape'){event.preventDefault();close();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
 },[open]);
 useEffect(()=>{if(open)document.getElementById(id+'-'+active)?.scrollIntoView({block:'nearest'});},[open,active,options.length,id]);
 return <><button ref={button} type="button" className="phone-country-trigger" title={selected.name+' (+'+selected.code+')'} aria-label={label+': '+selected.name+' (+'+selected.code+')'} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={()=>open?close():show()} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();show();}}}>{flag(selected.country)&&<img src={flag(selected.country)} alt="" className="phone-country-flag"/>}<span>+{selected.code}</span><ChevronDown size={13}/></button>
 {open&&createPortal(<section ref={panel} id={id} role="dialog" aria-label="Choose phone country" className="phone-country-panel" style={position}><div className="phone-country-search"><Search size={16}/><input ref={search} type="search" role="combobox" aria-label="Search countries or dialling codes" aria-expanded="true" aria-controls={id+'-options'} aria-autocomplete="list" aria-activedescendant={options.length?id+'-'+Math.min(active,options.length-1):undefined} placeholder="Search country or code…" value={term} onChange={event=>{setTerm(event.target.value);setActive(0);}} onKeyDown={event=>{
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(0,Math.min(options.length-1,index+(event.key==='ArrowDown'?1:-1))));}
  if(event.key==='Enter'){event.preventDefault();if(options[active])choose(options[active]);}
  if(event.key==='Tab'){event.preventDefault();close();if(!event.shiftKey)button.current?.closest('.stayman-phone-control')?.querySelector('input[name="phone"]')?.focus();}
 }}/></div><ul id={id+'-options'} role="listbox" aria-label="Countries">{options.map((item,index)=><li key={item.country} id={id+'-'+index} role="option" aria-selected={item.country===country} className={index===active?'is-active':''} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(item)}>{flag(item.country)&&<img src={flag(item.country)} alt="" className="phone-country-flag" loading="lazy"/>}<span>{item.name}</span><small>+{item.code}</small>{item.country===country&&<Check size={15}/>}</li>)}{!options.length&&<li className="phone-country-empty" role="presentation">No matching countries.</li>}</ul></section>,document.body)}
 </>;
}
