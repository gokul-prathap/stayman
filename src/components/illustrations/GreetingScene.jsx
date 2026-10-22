import {useAnimationActivity} from './useAnimationActivity';
import {useEffect,useId,useRef,useState} from 'react';
import './greeting-scene.css';

export default function GreetingScene({period='day'}){
 const activity=useAnimationActivity();
 const previous=useRef(period);
 const [changing,setChanging]=useState(false);
 useEffect(()=>{if(previous.current!==period){previous.current=period;setChanging(true);}},[period]);
 const id='greeting-'+useId().replace(/:/g,'');
 return <svg ref={activity} className="greeting-scene" data-sky={period} viewBox="0 0 1600 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
   <linearGradient id={id+'day'} x2="0" y2="1"><stop stopColor="#46a9ee"/><stop offset="1" stopColor="#c4edff"/></linearGradient>
   <linearGradient id={id+'night'} x2="0" y2="1"><stop stopColor="#050916"/><stop offset="1" stopColor="#101a35"/></linearGradient>
   <linearGradient id={id+'dusk'} x2="0" y2="1"><stop stopColor="#63378f"/><stop offset=".48" stopColor="#be659a"/><stop offset="1" stopColor="#ffaf5e"/></linearGradient>
  </defs>
  <path fill={'url(#'+id+'day)'} d="M0 0h1600v400H0z"/>
  <path className="greeting-night-sky" fill={'url(#'+id+'night)'} d="M0 0h1600v400H0z"/>
  <path className="greeting-dusk" fill={'url(#'+id+'dusk)'} d="M0 0h1600v400H0z"/>
  {changing&&<path key={period} className="greeting-transition-sky" onAnimationEnd={()=>setChanging(false)} fill={'url(#'+id+'dusk)'} d="M0 0h1600v400H0z"/>}
  <g className="greeting-stars" fill="#eef6ff">{Array.from({length:32},(_,i)=><circle key={i} cx={30+(i*137)%1540} cy={22+(i*53)%225} r={i%3===0?2:1.2} style={{animationDelay:-(i%7)+'s'}}/>)}</g>
  <g className="greeting-sun"><circle cx="1030" cy="105" r="65" fill="#ffeab0" opacity=".2"/><circle cx="1030" cy="105" r="43" fill="#ffeab0" opacity=".3"/><circle cx="1030" cy="105" r="30" fill="#fff4c9"/></g>
  <g className="greeting-moon"><circle cx="1110" cy="92" r="53" fill="#b7dcff" opacity=".12"/><circle cx="1110" cy="92" r="27" fill="#f0f6ff"/></g>
  <g className="greeting-clouds"><g className="greeting-cloud-drift" fill="#fff" opacity=".8"><path d="M640 100c-22 0-22-27-1-30 0-30 45-35 54-9 26-13 52 14 34 32l-10 7z"/><path d="M1170 158c-30 0-32-34-5-39 4-36 59-42 72-9 34-12 60 23 36 42l-12 6z"/><path d="M290 65c-19 0-20-22-2-26 2-24 39-28 47-6 23-8 40 15 24 28l-8 4z"/></g></g>
  <g className="greeting-far"><path d="M-100 310 100 220 280 295 470 190 680 290 900 180 1120 280 1350 190 1700 290V450H-100z"/></g>
  <g className="greeting-near"><path d="M-100 370 140 300 380 360 650 265 890 350 1150 250 1400 340 1700 270V450H-100z"/></g>
  <g className="greeting-cottage"><path className="greeting-house" d="M860 278h100v65H860z"/><path className="greeting-roof" d="m846 280 64-49 64 49z"/><path d="M874 294h16v19h-16zm48 0h16v19h-16z" fill="#ffe8a5"/><path d="M901 315h18v28h-18z" fill="#355367"/></g>
  <g className="greeting-front"><path d="M-100 410 130 356 360 395 650 340 900 385 1160 330 1420 380 1700 340V450H-100z"/></g>
 </svg>;
}
