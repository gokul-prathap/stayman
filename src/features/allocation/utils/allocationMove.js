export function moveError(stay, target, allocations, units, day) {
  const source = units.find(unit => unit.id === stay?.unitId);
  if (!stay || stay.status === 'MAINTENANCE' || !target || !source) return 'This reservation cannot be moved.';
  if (target.id === stay.unitId) return 'Choose a different bed.';
  if ((target.genderPolicy === 'FEMALE_ONLY' && stay.gender !== 'FEMALE') ||
      (target.genderPolicy === 'MALE_ONLY' && stay.gender !== 'MALE')) return 'Guest gender does not match room policy.';
  if (day && (day < stay.checkInDate || day >= stay.checkOutDate)) return 'Choose a day within this reservation.';
  const from = day || stay.checkInDate;
  const to = day ? nextDay(day) : stay.checkOutDate;
  if (allocations.some(other => other.id !== stay.id && other.unitId === target.id &&
      other.checkInDate < to && other.checkOutDate > from)) {
    return 'This bed is occupied or under maintenance during part of the stay.';
  }
  return '';
}

export function nextDay(day) {
  const date = new Date(day + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function moveOneNight(allocations, stayId, targetId, day, units) {
  const stay = allocations.find(item => item.id === stayId);
  const target = units.find(item => item.id === targetId);
  const error = moveError(stay, target, allocations, units, day);
  if (error) throw new Error(error);
  const end = nextDay(day);
  const pieces = [];
  if (stay.checkInDate < day) pieces.push({ ...stay, id: stay.id + ':before:' + day, checkOutDate: day });
  pieces.push({ ...stay, id: stay.id + ':night:' + day, unitId: targetId, checkInDate: day, checkOutDate: end });
  if (end < stay.checkOutDate) pieces.push({ ...stay, id: stay.id + ':after:' + day, checkInDate: end });
  return allocations.flatMap(item => item.id === stayId ? pieces : [item]);
}
