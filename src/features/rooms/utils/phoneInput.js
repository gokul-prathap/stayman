import { getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { Metadata } from 'libphonenumber-js/core';
import metadata from 'libphonenumber-js/metadata.max.json';
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const phoneCountries = getCountries().map(country => ({
 country, code:getCountryCallingCode(country), name:names.of(country),
 flag:[...country].map(char=>String.fromCodePoint(127397+char.charCodeAt(0))).join(''),
})).sort((a,b)=>a.name.localeCompare(b.name));
export const digitsOnly=value=>/^[0-9]*$/.test(value);
export function nationalDigitLimit(country) {
 const plan=new Metadata(metadata);plan.selectNumberingPlan(country);
 const lengths=['FIXED_LINE','MOBILE'].flatMap(type=>plan.numberingPlan.type(type)?.possibleLengths()||[]);
 return Math.min(Math.max(...(lengths.length?lengths:plan.numberingPlan.possibleLengths())),15-getCountryCallingCode(country).length);
}
export function limitNationalDigits(value,country) {return String(value).replace(/[^0-9]/g,'').slice(0,nationalDigitLimit(country));}
export function phoneCountry(value,fallback='IN') {return parsePhoneNumberFromString(value||'')?.country||fallback;}
export function whatsappURL(phone,link,desktop=false) {
 const parsed=parsePhoneNumberFromString(phone||'');
 if(!parsed?.isValid())throw new Error('Enter a valid WhatsApp number with country code.');
 const number=parsed.number.slice(1), text='Please complete your guest web check-in: '+link;
 return desktop?'https://web.whatsapp.com/send?phone='+number+'&text='+encodeURIComponent(text):'https://wa.me/'+number+'?text='+encodeURIComponent(text);
}
