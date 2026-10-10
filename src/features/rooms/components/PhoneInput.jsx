import {useId,useState} from 'react';
import {getCountryCallingCode} from 'libphonenumber-js/max';
import {digitsOnly,phoneCountries,nationalDigitLimit,limitNationalDigits} from '../utils/phoneInput';
export default function PhoneInput({country='IN',value='',error,onChange,onCountryChange,onBlur,label='Phone number',required=false}) {
 const id=useId(),[inputError,setInputError]=useState('');
 const code=getCountryCallingCode(country),limit=nationalDigitLimit(country);
 const national=value.startsWith('+'+code)?value.slice(code.length+1):value;
 const message=inputError||error;
 return <div><label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label><div className={'stayman-phone-control flex min-h-12 rounded-lg border bg-white focus-within:ring-2 focus-within:ring-blue-100 '+(message?'border-red-300':'border-slate-200')}>
 <select aria-label={label==='Phone number'?'Phone country code':label+' country code'} value={country} onChange={e=>{setInputError('');onCountryChange(e.target.value,limitNationalDigits(national,e.target.value));}} className="w-28 min-w-0 shrink-0 rounded-l-lg border-r border-slate-200 bg-slate-50 px-2 text-sm sm:w-32">{phoneCountries.map(item=><option key={item.country} value={item.country}>{item.flag} {item.name} (+{item.code})</option>)}</select>
 <input id={id} name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={national} required={required} maxLength={limit} pattern="[0-9]*" aria-invalid={!!message} aria-describedby={id+'-help'} onBlur={onBlur} placeholder={country==='IN'?'9876543210':'Phone number'} onPaste={e=>{const text=e.clipboardData.getData('text');if(!digitsOnly(text)){e.preventDefault();setInputError('Use digits only (0–9).');}}} onChange={e=>{if(!digitsOnly(e.target.value)){setInputError('Use digits only (0–9).');return;}setInputError('');onChange('+'+code+limitNationalDigits(e.target.value,country));}} className="w-full min-w-0 rounded-r-lg px-3 text-base outline-none sm:text-sm"/>
 </div><p id={id+'-help'} role={message?'status':undefined} className={'mt-1 text-xs '+(message?'text-red-600':'text-slate-400')}>{message||national.length+'/'+limit+' digits maximum for +'+code}</p></div>;
}
