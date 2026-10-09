import { getCountries, getCountryCallingCode } from 'libphonenumber-js/max';
const names = new Intl.DisplayNames(['en'], { type: 'region' });
export const phoneCountries = getCountries().map(country => ({
  country, code: getCountryCallingCode(country), name: names.of(country),
  flag: [...country].map(char => String.fromCodePoint(127397 + char.charCodeAt(0))).join(''),
})).sort((a, b) => a.name.localeCompare(b.name));
export const digitsOnly = value => /^[0-9]*$/.test(value);
