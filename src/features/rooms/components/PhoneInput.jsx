import PhoneCountryPicker from './PhoneCountryPicker';
import {useId,useState} from 'react';
import {getCountryCallingCode} from 'libphonenumber-js/max';
import {digitsOnly,phoneCountries,nationalDigitLimit,limitNationalDigits} from '../utils/phoneInput';
export default function PhoneInput({country='IN',value='',error,onChange,onCountryChange,onBlur,label='Phone number',required=false}) {
 const id=useId(),[inputError,setInputError]=useState(''),[countryChanged,setCountryChanged]=useState(false);
 const code=getCountryCallingCode(country),limit=nationalDigitLimit(country);
 const national=value.startsWith('+'+code)?value.slice(code.length+1):value;
 const message=inputError||error;
 return <div><label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label><div className={'stayman-phone-control flex min-h-12 rounded-lg border bg-white focus-within:ring-2 focus-within:ring-blue-100 '+(message?'border-red-300':'border-slate-200')}>
 <PhoneCountryPicker country={country} label={label==='Phone number'?'Phone country code':label+' country code'} onChange={next=>{setInputError('');setCountryChanged(true);onCountryChange(next,'');}}/>
 <input id={id} name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={national} required={required} maxLength={limit} pattern="[0-9]*" aria-invalid={!!message} aria-describedby={id+'-help'} onBlur={event=>{setCountryChanged(false);onBlur?.(event);}} placeholder={country==='IN'?'9876543210':'Phone number'} onPaste={e=>{const text=e.clipboardData.getData('text');if(!digitsOnly(text)){e.preventDefault();setInputError('Use digits only (0–9).');}}} onChange={e=>{if(!digitsOnly(e.target.value)){setInputError('Use digits only (0–9).');return;}setInputError('');setCountryChanged(false);onChange('+'+code+limitNationalDigits(e.target.value,country));}} className="w-full min-w-0 rounded-r-lg px-3 text-base outline-none sm:text-sm"/>
 </div><p id={id+'-help'} role={message?'status':undefined} className={'mt-1 text-xs '+(message?'text-red-600':'text-slate-400')}>{message||(countryChanged?'Enter the phone number for '+phoneCountries.find(item=>item.country===country)?.name+' (+'+code+').':national.length+'/'+limit+' digits maximum for +'+code)}</p></div>;
}
