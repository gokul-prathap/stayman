import test from 'node:test';
import assert from 'node:assert/strict';
import { moveError, moveOneNight } from '../src/features/allocation/utils/allocationMove.js';
const units = [{ id:'a', type:'BED' }, { id:'b', type:'BED' }, { id:'room', type:'ROOM' }];
const stay = { id:'one', unitId:'a', checkInDate:'2026-10-10', checkOutDate:'2026-10-13', status:'CHECKED_IN' };
test('allows free bed and back-to-back stays', () => {
  assert.equal(moveError(stay, units[1], [stay, {id:'two',unitId:'b',checkInDate:'2026-10-13',checkOutDate:'2026-10-14'}], units), '');
});
test('rejects overlap anywhere during stay, maintenance while allowing different accommodation types', () => {
  assert.ok(moveError(stay, units[1], [stay,{id:'two',unitId:'b',status:'MAINTENANCE',checkInDate:'2026-10-12',checkOutDate:'2026-10-14'}], units));
  assert.ok(moveError(stay, units[0], [stay], units));
  assert.equal(moveError(stay, units[2], [stay], units), '');
});

test('moving a middle night preserves both surrounding nights and reservation reference', () => {
  const result = moveOneNight([stay], 'one', 'b', '2026-10-11', units);
  assert.deepEqual(result.map(item => [item.unitId, item.checkInDate, item.checkOutDate]), [
    ['a','2026-10-10','2026-10-11'], ['b','2026-10-11','2026-10-12'], ['a','2026-10-12','2026-10-13'],
  ]);
  assert.ok(result.every(item => item.guestName === stay.guestName));
});
test('one-night availability ignores conflicts on other nights', () => {
  const other = { id:'other',unitId:'b',checkInDate:'2026-10-12',checkOutDate:'2026-10-13' };
  assert.equal(moveError(stay, units[1], [stay,other], units, '2026-10-10'), '');
  assert.ok(moveError(stay, units[1], [stay,other], units, '2026-10-12'));
});
test('first and last night create no empty segments and outside dates are rejected', () => {
  for (const day of ['2026-10-10','2026-10-12']) {
    const result = moveOneNight([stay], 'one', 'b', day, units);
    assert.equal(result.length, 2);
    assert.ok(result.every(item => item.checkInDate < item.checkOutDate));
  }
  assert.throws(() => moveOneNight([stay], 'one', 'b', '2026-10-13', units));
});
