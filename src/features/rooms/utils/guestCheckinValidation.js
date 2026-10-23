import {isGuestGender} from '../../../services/guestGender.js';
import { getCountryCallingCode,parsePhoneNumberFromString } from 'libphonenumber-js/max';
import isEmail from 'validator/lib/isEmail.js';
import {identityPolicy} from './identityPolicy.js';
export function propertyToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = type => parts.find(part => part.type === type).value;
  return value('year') + '-' + value('month') + '-' + value('day');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function guestFieldErrors(details, today = propertyToday()) {
  const errors = {};
  const text = field => typeof details[field] === 'string' ? details[field].trim() : '';
  const name = text('full_name');
  if (name.length < 2 || name.length > 100 || !/^[\p{L}\p{M} .’'\-]+$/u.test(name) || !/\p{L}/u.test(name)) {
    errors.full_name = 'Enter your name as shown on your ID (at least 2 characters).';
  }
  if(!isGuestGender(details.gender))errors.gender='Choose your gender, or select Prefer not to say.';
  const address=text('address');
  if(address&&(address.length<5||address.length>500||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(address)))errors.address='Enter an address between 5 and 500 characters, without special markup.';
  const email = text('email');
  if (email.length > 254 || !isEmail(email)) errors.email = 'Enter a valid email, such as name@example.com.';
  const phone = text('phone');
  const parsed = parsePhoneNumberFromString(phone, details.phone_country || 'IN');
  if (!/^[+]?[0-9() .-]+$/.test(phone) || !parsed?.isPossible() || (details.phone_country && parsed.countryCallingCode !== getCountryCallingCode(details.phone_country)) ||
      (parsed?.countryCallingCode === '91' && !/^[6-9][0-9]{9}$/.test(parsed.nationalNumber))) {
    const country=details.phone_country||'IN';
    const countryName=new Intl.DisplayNames(['en'],{type:'region'}).of(country);
    errors.phone = 'Check the phone number length and country code for '+countryName+'.';
  }
  for (const [field, label] of [['coming_from', 'coming from'], ['going_to', 'going to']]) {
    const value = text(field);
    if (value.length < 2 || value.length > 150 || !/\p{L}/u.test(value) || /[<>\u0000-\u001f]/.test(value)) {
      errors[field] = 'Enter a city or location you are ' + label + ' (at least 2 characters).';
    }
  }
  if (!validDate(details.arrival_date)) errors.arrival_date = 'Choose a valid arrival date.';
  else if (details.arrival_date < today) errors.arrival_date = 'Arrival cannot be before today.';
  if (!validDate(details.departure_date)) errors.departure_date = 'Choose a valid departure date.';
  else if (details.departure_date < today) errors.departure_date = 'Departure cannot be before today.';
  else if (validDate(details.arrival_date) && details.departure_date <= details.arrival_date) errors.departure_date = 'Departure must be later than arrival.';
  return errors;
}

export function validateGuestDetails(details, today = propertyToday()) {
  const cleaned = { ...details };
  for (const field of ['full_name', 'address', 'email', 'phone', 'coming_from', 'going_to']) {
    cleaned[field] = typeof details[field] === 'string' ? details[field].trim() : '';
  }
  const errors = guestFieldErrors(cleaned, today);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (typeof cleaned.foreign_guest !== 'boolean') throw new Error('Please select your document type.');
  cleaned.document_type=identityPolicy(cleaned).type;
  const parsed = parsePhoneNumberFromString(cleaned.phone, cleaned.phone_country || 'IN');
  cleaned.phone = parsed.number;
  const at = cleaned.email.lastIndexOf('@');
  cleaned.email = cleaned.email.slice(0, at + 1) + cleaned.email.slice(at + 1).toLowerCase();
  delete cleaned.phone_country;
  return cleaned;
}
