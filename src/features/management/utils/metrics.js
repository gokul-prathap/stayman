export function dayInZone(value = new Date(), timezone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function shiftDay(day, amount) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
export function nights(from, to) {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
}
export function money(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(paise || 0) / 100);
}
export function rupeesToPaise(value) {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = String(value).split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount)) throw new Error('Amount is too large.');
  return amount;
}
export function stayKind(bookings, today) {
  const active = bookings.filter(r => r.status !== 'CANCELLED');
  if (active.some(r => r.status !== 'CHECKED_OUT' && r.check_in_date <= today && today < r.check_out_date)) return 'current';
  if (active.some(r => r.status !== 'CHECKED_OUT' && r.check_in_date > today)) return 'future';
  return 'past';
}
export function roomGroups(units) {
  const groups = new Map();
  units.forEach(unit => {
    const key = JSON.stringify([unit.type, unit.roomName]);
    if (!groups.has(key)) groups.set(key, { key, name: unit.roomName, type: unit.type, units: [] });
    groups.get(key).units.push(unit);
  });
  return [...groups.values()];
}
export function reportMetrics(data, from, to, timezone = 'Asia/Kolkata') {
  if (!from || !to || to < from || nights(from, to) > 365) throw new Error('Choose a date range of up to 366 days.');
  const reservations = data.reservations.filter(r => r.status !== 'CANCELLED');
  const validIds = new Set(reservations.map(r => r.id));
  const unitIds = new Set(data.units.map(u => u.id));
  const days = [];
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    const occupied = new Set(), blocked = new Set();
    data.allocations.forEach(a => {
      if (!unitIds.has(a.unitId) || day < a.checkInDate || day >= a.checkOutDate) return;
      if (a.status === 'MAINTENANCE') blocked.add(a.unitId);
      else if (validIds.has(a.reservationDbId)) occupied.add(a.unitId);
    });
    const available = unitIds.size - blocked.size;
    let earned = 0;
    const priced = data.allocations.filter(a => validIds.has(a.reservationDbId) && a.checkInDate <= day && day < a.checkOutDate);
    if (priced.length && priced.every(a => Number.isSafeInteger(a.chargePaise))) {
      priced.forEach(a => {
        const charge=BigInt(a.chargePaise), duration=BigInt(nights(a.checkInDate,a.checkOutDate));
        const offset=BigInt(nights(a.checkInDate,day));
        earned+=Number(charge*(offset+1n)/duration-charge*offset/duration);
      });
    } else reservations.forEach(r => {
      if (day >= r.check_in_date && day < r.check_out_date) earned += Number(r.total_amount) / nights(r.check_in_date, r.check_out_date);
    });
    const cash = (data.payments || []).filter(p => p.method !== 'OPENING' && dayInZone(p.paid_at, timezone) === day).reduce((sum, p) => sum + (p.kind === 'REFUND' ? -1 : 1) * Number(p.amount_paise), 0);
    days.push({ day, occupied: occupied.size, blocked: blocked.size, available, earned, cash,
      occupancy: available ? occupied.size / available * 100 : 0 });
  }
  const occupied = days.reduce((s, d) => s + d.occupied, 0);
  const available = days.reduce((s, d) => s + d.available, 0);
  const earned = Math.round(days.reduce((s, d) => s + d.earned, 0));
  const cash = days.reduce((s, d) => s + d.cash, 0);
  const opening = (data.payments || []).filter(p => p.method === 'OPENING' && dayInZone(p.paid_at, timezone) >= from && dayInZone(p.paid_at, timezone) <= to).reduce((s, p) => s + Number(p.amount_paise), 0);
  return { days, occupied, available, earned, cash, opening, occupancy: available ? occupied / available * 100 : 0,
    adr: occupied ? earned / occupied : 0, utilization: unitIds.size ? occupied / (unitIds.size * days.length) * 100 : 0,
    arrivals: reservations.filter(r => r.check_in_date >= from && r.check_in_date <= to),
    departures: reservations.filter(r => r.check_out_date >= from && r.check_out_date <= to) };
}
