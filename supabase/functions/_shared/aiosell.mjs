// Shared by Edge Functions and Node contract tests. Never retain creditCard data.
export function normalizeReservation(input) {
  const text = (value, max = 120) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  if (!input || !['book', 'modify', 'cancel'].includes(input.action)) throw new Error('Invalid reservation action.');
  const result = {action: input.action, hotelCode: text(input.hotelCode), channel: text(input.channel), bookingId: text(input.bookingId)};
  if (!result.hotelCode || !result.channel || !result.bookingId) throw new Error('Missing booking identifiers.');
  if (input.action === 'cancel') return result;
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
  if (!date(input.checkin) || !date(input.checkout) || input.checkout <= input.checkin || (Date.parse(input.checkout) - Date.parse(input.checkin)) / 86400000 > 365) throw new Error('Invalid stay dates.');
  const amount = input.amount?.amountAfterTax;
  if (input.amount?.currency !== 'INR' || typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new Error('Invalid amount or unsupported currency.');
  if (!Array.isArray(input.rooms) || !input.rooms.length || input.rooms.length > 50) throw new Error('Invalid rooms.');
  const rooms = input.rooms.map(room => {
    const roomCode = text(room.roomCode), rateplanCode = text(room.rateplanCode);
    if (!roomCode || !rateplanCode) throw new Error('Missing room mapping.');
    return {roomCode, rateplanCode};
  });
  const guest = input.guest || {};
  const phone = text(guest.phone, 25), email = text(guest.email, 254);
  const name = [text(guest.firstName, 50), text(guest.lastName, 49)].filter(Boolean).join(' ');
  return {...result, checkin: input.checkin, checkout: input.checkout, rooms,
    totalPaise: Math.round(amount * 100), payAtHotel: input.pah === true,
    guest: {name: name.length >= 2 ? name : 'OTA guest',
      phone: /^[+0-9() .-]{7,25}$/.test(phone) ? phone : null,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null},
    specialRequests: text(input.specialRequests, 900)};
}

export async function basicMatches(header, username, password) {
  if (!username || !password || !header?.startsWith('Basic ')) return false;
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const expected = 'Basic ' + btoa(`${username}:${password}`);
  const [a, b] = await Promise.all([digest(header), digest(expected)]);
  return a.reduce((different, value, i) => different | (value ^ b[i]), 0) === 0;
}

export async function aiosellRequest(path, body, env, fetcher = fetch) {
  const base = env('AIOSELL_API_BASE_URL') || 'https://live.aiosell.com/api/v2/cm';
  const target = new URL(base);
  if (target.protocol !== 'https:' || target.hostname !== 'live.aiosell.com' || target.username || target.password || target.search || target.hash) throw new Error('Invalid Aiosell endpoint configuration.');
  const username = env('AIOSELL_API_USERNAME'), password = env('AIOSELL_API_PASSWORD');
  if (!username || !password) throw new Error('Aiosell API secrets are missing.');
  const response = await fetcher(base.replace(/\/$/, '') + path, {method: body ? 'POST' : 'GET',
    headers: {Authorization: 'Basic ' + btoa(`${username}:${password}`), 'Content-Type': 'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(15000), redirect: 'error'});
  if (!response.ok) throw new Error(`Aiosell HTTP ${response.status}.`);
  const data = await response.json();
  const datasetRead = path.startsWith('/data/') && ['inventory', 'rates'].includes(body?.type);
  if (data?.success === false || data?.status === false || body && !datasetRead && data?.success !== true && data?.status !== true) throw new Error('Aiosell rejected the update.');
  if (datasetRead && (data?.hotelCode !== body.hotelCode || !Array.isArray(data.updates))) throw new Error('Aiosell returned an unrecognized data response.');
  return data;
}
