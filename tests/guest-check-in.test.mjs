import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGuestDetails } from '../src/features/rooms/utils/guestCheckinValidation.js';

const valid = {
  full_name: ' Guest Name ', email: ' guest@example.com ', phone: '+91 98765 43210',
  arrival_date: '2026-10-09', departure_date: '2026-10-10',
  coming_from: ' Bengaluru ', going_to: ' Kochi ', foreign_guest: false,
};

test('normalizes guest contact details without claiming email ownership', () => {
  const result = validateGuestDetails(valid);
  assert.equal(result.full_name, 'Guest Name');
  assert.equal(result.email, 'guest@example.com');
  assert.equal(result.coming_from, 'Bengaluru');
  assert.equal(valid.full_name, ' Guest Name ');
});

test('rejects whitespace names, malformed email and phone with no digits', () => {
  for (const invalid of [
    { full_name: '   ' }, { email: 'not-an-email' }, { phone: '.......' },
    { coming_from: '' }, { going_to: 'x'.repeat(161) },
  ]) assert.throws(() => validateGuestDetails({ ...valid, ...invalid }));
});

test('rejects impossible dates and departure before arrival', () => {
  for (const invalid of [
    { arrival_date: '2026-02-30' }, { departure_date: '2026-10-08' },
    { arrival_date: '' }, { departure_date: 'not-a-date' },
  ]) assert.throws(() => validateGuestDetails({ ...valid, ...invalid }));
});

test('accepts same-day stays and leap-day dates', () => {
  assert.equal(validateGuestDetails({ ...valid, departure_date: valid.arrival_date }).departure_date, valid.arrival_date);
  assert.equal(validateGuestDetails({ ...valid, arrival_date: '2028-02-29', departure_date: '2028-03-01' }).arrival_date, '2028-02-29');
});
