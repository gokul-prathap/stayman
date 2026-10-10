import React,{useEffect,useRef,useState} from 'react';
import {getCountryCallingCode,parsePhoneNumberFromString} from 'libphonenumber-js/max';
import PhoneInput from '../../rooms/components/PhoneInput';
import {phoneCountry,whatsappURL} from '../../rooms/utils/phoneInput';
export default function CheckinShare({link,phone='',propertyName='your property',publicLink=false}) {
 const canvas=useRef(null),[qrError,setQrError]=useState(''),[copied,setCopied]=useState(false);
 const [country,setCountry]=useState(()=>phoneCountry(phone)),[number,setNumber]=useState(()=>parsePhoneNumberFromString(phone,'IN')?.number||'');
 const valid=parsePhoneNumberFromString(number)?.isValid();
 useEffect(()=>{let active=true;setQrError('');import('qrcode').then(module=>{if(active&&canvas.current)return module.default.toCanvas(canvas.current,link,{width:220,margin:2,errorCorrectionLevel:'M',color:{dark:'#142b48',light:'#ffffff'}});}).catch(()=>{if(active)setQrError('QR unavailable. Copy or share the link below.');});return()=>{active=false;};},[link]);
 const href=valid?whatsappURL(number,link,!window.matchMedia('(max-width: 767px)').matches):'';
 return <div className="notice space-y-3"><h3 className="text-sm font-semibold">Scan to check in · {propertyName}</h3><canvas ref={canvas} role="img" aria-label="Guest web check-in QR code" className="mx-auto h-auto max-w-full rounded-lg bg-white"/>{qrError&&<p role="alert">{qrError}</p>}
 <label>{publicLink?'Reception check-in link':'Private check-in link'}<input aria-label={publicLink?'Reception check-in link':'Private check-in link'} readOnly value={link} onFocus={e=>e.target.select()}/></label><div className="flex flex-wrap gap-2"><button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);}catch{setQrError('Select and copy the link above.');}}}>{copied?'Copied':'Copy link'}</button><a className="secondary" href={link} target="_blank" rel="noreferrer">Open link</a></div>
 <PhoneInput label="WhatsApp number" country={country} value={number} onChange={setNumber} onCountryChange={(c,n)=>{setCountry(c);setNumber('+'+getCountryCallingCode(c)+n);}} error={number&& !valid?'Enter a valid WhatsApp number.':undefined}/>
 {href?<a className="primary inline-block" href={href} target="_blank" rel="noreferrer">Open WhatsApp to send</a>:<button type="button" disabled className="primary">Enter WhatsApp number to share</button>}<p className="text-xs">WhatsApp opens with the message ready; press Send there. {publicLink?'This permanent property link sends submissions to the walk-in inbox.':'Copy this private link now. Generating another replaces it.'}</p></div>;
}
