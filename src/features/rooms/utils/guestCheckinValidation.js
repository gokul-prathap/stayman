export function validateGuestDetails(details) {
  const cleaned = { ...details };
  for (const field of ['full_name', 'email', 'phone', 'coming_from', 'going_to']) {
    cleaned[field] = typeof details[field] === 'string' ? details[field].trim() : '';
  }
  for (const [field, label, limit] of [
    ['full_name', 'Full name', 120], ['coming_from', 'Coming from', 160], ['going_to', 'Going to', 160],
  ]) {
    if (!cleaned[field] || cleaned[field].length > limit) throw new Error(`Please enter a valid ${label.toLowerCase()}.`);
  }
  if (cleaned.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned.email)) {
    throw new Error('Please enter a valid contact email.');
  }
  if (!/^[+0-9() .-]{7,25}$/.test(cleaned.phone) || cleaned.phone.replace(/\D/g, '').length < 7) {
    throw new Error('Please enter a valid phone number.');
  }
  for (const field of ['arrival_date', 'departure_date']) {
    const value = cleaned[field];
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Please enter valid arrival and departure dates.');
    }
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new Error('Please enter valid arrival and departure dates.');
    }
  }
  if (cleaned.departure_date < cleaned.arrival_date) throw new Error('Departure must be on or after arrival.');
  if (typeof cleaned.foreign_guest !== 'boolean') throw new Error('Please select your document type.');
  return cleaned;
}
