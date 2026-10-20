import test from 'node:test';
import assert from 'node:assert/strict';
import {guestFieldErrors} from '../src/features/rooms/utils/guestCheckinValidation.js';
test('international guest numbers are not rejected just because their prefix is unrecognised',()=>{
 assert.equal(guestFieldErrors({phone:'+590232323232',phone_country:'GP'}).phone,undefined);
});
test('international numbers still require a possible length and matching calling code',()=>{
 assert.ok(guestFieldErrors({phone:'+5902323',phone_country:'GP'}).phone);
 assert.ok(guestFieldErrors({phone:'+590232323232222',phone_country:'GP'}).phone);
 assert.ok(guestFieldErrors({phone:'+919876543210',phone_country:'GP'}).phone);
 assert.ok(guestFieldErrors({phone:'+59023ABC3232',phone_country:'GP'}).phone);
});
test('Indian mobile length and starting-digit rules remain enforced',()=>{
 assert.equal(guestFieldErrors({phone:'+919876543210',phone_country:'IN'}).phone,undefined);
 assert.ok(guestFieldErrors({phone:'+912323232323',phone_country:'IN'}).phone);
 assert.ok(guestFieldErrors({phone:'+91987654321',phone_country:'IN'}).phone);
});
