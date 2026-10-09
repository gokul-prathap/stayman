import { useState } from 'react';
import { getCountryCallingCode } from 'libphonenumber-js/max';
import { digitsOnly, phoneCountries } from '../utils/phoneInput';

export default function PhoneInput({ country, value, error, onChange, onCountryChange, onBlur }) {
  const [inputError, setInputError] = useState('');
  const code = getCountryCallingCode(country);
  const national = value.startsWith('+' + code) ? value.slice(code.length + 1) : value;
  const message = inputError || error;
  return <div>
    <label htmlFor="guest-phone" className="mb-1.5 block text-sm font-medium text-slate-700">Phone number</label>
    <div className={'flex min-h-12 rounded-lg border bg-white focus-within:ring-2 focus-within:ring-indigo-100 ' + (message ? 'border-red-300' : 'border-slate-200')}>
      <select aria-label="Phone country code" value={country} onChange={event => {
        setInputError(''); onCountryChange(event.target.value, national);
      }} className="w-28 min-w-0 rounded-l-lg border-r border-slate-200 bg-slate-50 px-2 text-sm sm:w-32">
        {phoneCountries.map(item => <option key={item.country} value={item.country}>{item.flag} {item.name} (+{item.code})</option>)}
      </select>
      <input id="guest-phone" name="phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={national}
        aria-invalid={!!message} aria-describedby={message ? 'guest-phone-error' : undefined}
        onBlur={onBlur} placeholder={country === 'IN' ? '9876543210' : 'Phone number'}
        onPaste={event => { if (!digitsOnly(event.clipboardData.getData('text'))) {
          event.preventDefault(); setInputError('Use digits only (0–9).');
        } }}
        onChange={event => {
          if (!digitsOnly(event.target.value)) { setInputError('Use digits only (0–9).'); return; }
          setInputError(''); onChange('+' + code + event.target.value);
        }} className="w-full min-w-0 rounded-r-lg px-3 text-base outline-none sm:text-sm" />
    </div>
    {message && <p id="guest-phone-error" role="status" className="mt-1 text-xs text-red-600">{message}</p>}
  </div>;
}
