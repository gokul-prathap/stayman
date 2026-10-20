import test from 'node:test';
import assert from 'node:assert/strict';
import {propertyBranding,propertyInitials,instagramProfile,instagramHandle} from '../src/services/propertyBranding.js';
test('missing property profile never borrows another property branding or contacts',()=>{
 const profile=propertyBranding(null);assert.equal(profile.name,'Guest check-in');assert.equal(profile.logo_path,'');assert.equal(profile.tagline,'');assert.equal(profile.instagram_url,'');assert.equal(profile.whatsapp_number,'');
});
test('each property keeps its own configured branding and optional contacts',()=>{
 const profile=propertyBranding({name:'Garden Homestay',tagline:'Quiet stays',logo_path:'garden/logo.png',instagram_url:'https://www.instagram.com/garden_stays/',whatsapp_number:'+919876543210'});
 assert.equal(profile.name,'Garden Homestay');assert.equal(profile.tagline,'Quiet stays');assert.equal(profile.logo_path,'garden/logo.png');assert.equal(instagramHandle(profile.instagram_url),'@garden_stays');assert.equal(propertyInitials(profile.name),'GH');
});
test('unsafe social links are hidden and Instagram handles normalize to profile URLs',()=>{
 assert.equal(propertyBranding({instagram_url:'javascript:alert(1)',facebook_url:'https://untrusted.test/',whatsapp_number:'123'}).instagram_url,'');
 assert.equal(propertyBranding({facebook_url:'https://untrusted.test/'}).facebook_url,'');
 assert.equal(instagramProfile('@garden_stays'),'https://www.instagram.com/garden_stays/');
 assert.equal(instagramProfile('https://instagram.com/garden_stays/?igsh=test'),'https://www.instagram.com/garden_stays/');
 assert.equal(instagramProfile(''),'');assert.equal(instagramHandle('https://instagram.com/'),'Instagram');
});
