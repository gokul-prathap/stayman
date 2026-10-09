import test from 'node:test';
import assert from 'node:assert/strict';
import { validateGuestDetails, guestFieldErrors, propertyToday } from '../src/features/rooms/utils/guestCheckinValidation.js';

const valid = {
  full_name: ' Guest Name ', email: ' guest@example.com ', phone: '+91 98765 43210',
  arrival_date: '2026-10-09', departure_date: '2026-10-10',
  coming_from: ' Bengaluru ', going_to: ' Kochi ', foreign_guest: false,
};

test('normalizes guest contact details without claiming email ownership', () => {
  const result = validateGuestDetails(valid, '2026-10-09');
  assert.equal(result.full_name, 'Guest Name');
  assert.equal(result.email, 'guest@example.com');
  assert.equal(result.coming_from, 'Bengaluru');
  assert.equal(valid.full_name, ' Guest Name ');
});

test('rejects whitespace names, malformed email and phone with no digits', () => {
  for (const invalid of [
    { full_name: '   ' }, { email: 'not-an-email' }, { phone: '.......' },
    { coming_from: '' }, { going_to: 'x'.repeat(161) },
  ]) assert.throws(() => validateGuestDetails({ ...valid, ...invalid }, '2026-10-09'));
});

test('rejects impossible dates and departure before arrival', () => {
  for (const invalid of [
    { arrival_date: '2026-02-30' }, { departure_date: '2026-10-08' },
    { arrival_date: '' }, { departure_date: 'not-a-date' },
  ]) assert.throws(() => validateGuestDetails({ ...valid, ...invalid }, '2026-10-09'));
});

test('rejects same-day stays and accepts leap-day dates', () => {
  assert.throws(() => validateGuestDetails({ ...valid, departure_date: valid.arrival_date }, '2026-10-09'));
  assert.equal(validateGuestDetails({ ...valid, arrival_date: '2028-02-29', departure_date: '2028-03-01' }, '2026-10-09').arrival_date, '2028-02-29');
});

test('live validation rejects past dates and rechecks departure when arrival changes', () => {
  assert.ok(guestFieldErrors({ ...valid, arrival_date: '2026-10-08' }, '2026-10-09').arrival_date);
  assert.ok(guestFieldErrors({ ...valid, arrival_date: '2026-10-11' }, '2026-10-09').departure_date);
});
test('Indian and international numbers use consistent phone rules', () => {
  for (const phone of ['9876543210', '+91 98765 43210', '+44 7911 123456']) {
    assert.equal(guestFieldErrors({ ...valid, phone }, '2026-10-09').phone, undefined);
  }
  for (const phone of ['1234567890', '987654321', '+91 1234567890', '+1234567890123456', '++919876543210']) {
    assert.ok(guestFieldErrors({ ...valid, phone }, '2026-10-09').phone);
  }
});
test('locations accept international names and reject empty or numeric-only text', () => {
  assert.equal(guestFieldErrors({ ...valid, coming_from: 'São Paulo', going_to: '東京' }, '2026-10-09').coming_from, undefined);
  assert.ok(guestFieldErrors({ ...valid, coming_from: '123', going_to: ' ' }, '2026-10-09').going_to);
});
test('today uses India timezone across UTC midnight boundary', () => {
  assert.equal(propertyToday(new Date('2026-10-08T20:00:00Z')), '2026-10-09');
});

test('digits-only national input rejects letters, formatting and accepts pasted digits', async () => {
  const { digitsOnly } = await import('../src/features/rooms/utils/phoneInput.js');
  assert.ok(digitsOnly('9876543210'));
  for (const value of ['abc', '98a76', '+91', '98 76', '123-456']) assert.equal(digitsOnly(value), false);
});
test('normalizes E.164 payload and revalidates country changes', () => {
  assert.equal(validateGuestDetails({ ...valid, phone: '9876543210', phone_country: 'IN' }, '2026-10-09').phone, '+919876543210');
  assert.ok(guestFieldErrors({ ...valid, phone: '+919876543210', phone_country: 'US' }, '2026-10-09').phone);
  assert.equal(validateGuestDetails({ ...valid, email: 'Guest@EXAMPLE.COM' }, '2026-10-09').email, 'Guest@example.com');
});
