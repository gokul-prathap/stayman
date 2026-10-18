import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hasOtpSession} from './adminSession.js';
const session=claims=>({access_token:'header.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.signature'});
test('password, recovery, malformed and absent sessions route to OTP login',()=>{
 for(const input of [null,{}, {access_token:'broken'},session({amr:[{method:'password'}]}),session({amr:[{method:'recovery'}]}),session({amr:{method:'otp'}}),session({})])assert.equal(hasOtpSession(input),false);
});
test('OTP sessions remain recognized after refresh or MFA',()=>{
 assert.equal(hasOtpSession(session({amr:[{method:'otp'}],is_anonymous:false})),true);
 assert.equal(hasOtpSession(session({amr:[{method:'otp'},{method:'token_refresh'},{method:'totp'}]})),true);
});
test('anonymous sessions never enter admin UI even with an OTP claim',()=>{
 assert.equal(hasOtpSession(session({is_anonymous:true,amr:[{method:'otp'}]})),false);
});
