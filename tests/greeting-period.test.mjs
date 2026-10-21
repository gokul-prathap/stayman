import test from 'node:test';
import assert from 'node:assert/strict';
import {greetingPeriod} from '../src/components/illustrations/greetingPeriod.js';
test('greeting scenery follows local time at day, sunset and night boundaries',()=>{
 for(const [time,expected] of [['05:59','night'],['06:00','day'],['16:59','day'],['17:00','sunset'],['18:59','sunset'],['19:00','night'],['23:59','night']]){
  assert.equal(greetingPeriod(new Date('2026-10-21T'+time+':00+05:30'),'Asia/Kolkata'),expected);
 }
 const date=new Date('2026-10-21T12:00:00Z');
 assert.equal(greetingPeriod(date,'Asia/Kolkata'),'sunset');
 assert.equal(greetingPeriod(date,'America/New_York'),'day');
});
