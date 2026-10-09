import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import isEmail from 'validator/lib/isEmail.js';
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
  const email = text('email');
  if (email.length > 254 || !isEmail(email)) errors.email = 'Enter a valid email, such as name@example.com.';
  const phone = text('phone');
  const parsed = parsePhoneNumberFromString(phone, details.phone_country || 'IN');
  if (!/^[+]?[0-9() .-]+$/.test(phone) || !parsed?.isValid() || (details.phone_country && parsed.country !== details.phone_country) ||
      (parsed?.country === 'IN' && !/^[6-9][0-9]{9}$/.test(parsed.nationalNumber))) {
    errors.phone = 'Enter a valid phone number for the selected country.';
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
  for (const field of ['full_name', 'email', 'phone', 'coming_from', 'going_to']) {
    cleaned[field] = typeof details[field] === 'string' ? details[field].trim() : '';
  }
  const errors = guestFieldErrors(cleaned, today);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  if (typeof cleaned.foreign_guest !== 'boolean') throw new Error('Please select your document type.');
  const parsed = parsePhoneNumberFromString(cleaned.phone, cleaned.phone_country || 'IN');
  cleaned.phone = parsed.number;
  const at = cleaned.email.lastIndexOf('@');
  cleaned.email = cleaned.email.slice(0, at + 1) + cleaned.email.slice(at + 1).toLowerCase();
  delete cleaned.phone_country;
  return cleaned;
}
