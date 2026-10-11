import test from 'node:test';
import assert from 'node:assert/strict';
import {nationalDigitLimit,limitNationalDigits,whatsappURL,phoneCountry,phoneCountries} from '../src/features/rooms/utils/phoneInput.js';
test('country digit limits reflect ordinary numbers, excluding India machine numbers',()=>{
 assert.equal(nationalDigitLimit('IN'),10);
 assert.equal(nationalDigitLimit('US'),10);
 assert.equal(nationalDigitLimit('GB'),10);
 assert.equal(nationalDigitLimit('AE'),9);
 assert.equal(nationalDigitLimit('SG'),8);
 for(const item of phoneCountries)assert.ok(nationalDigitLimit(item.country)>0&&nationalDigitLimit(item.country)+item.code.length<=15);
});
test('changing country caps digits and rejects nonnumeric national input via normalization',()=>{
 assert.equal(limitNationalDigits('98765432109999','IN'),'9876543210');
 assert.equal(limitNationalDigits('1234567890','SG'),'12345678');
 assert.equal(phoneCountry('+14155552671'),'US');
});
test('WhatsApp shares the private URL as encoded message and uses the full international recipient',()=>{
 const link='https://stayman.example/guest-check-in#invite='+'a'.repeat(64);
 const url=new URL(whatsappURL('+919876543210',link,true));
 assert.equal(url.hostname,'web.whatsapp.com');
 assert.equal(url.searchParams.get('phone'),'919876543210');
 assert.ok(url.searchParams.get('text').endsWith(link));
 assert.equal(new URL(whatsappURL('+14155552671',link)).pathname,'/14155552671');
 assert.throws(()=>whatsappURL('bad',link),/valid WhatsApp/);
});
