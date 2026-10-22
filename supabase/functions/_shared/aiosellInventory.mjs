export function inventoryTrace(job) {
  const capacities = new Map(), assigned = new Set();
  for (const mapping of job.mappings) {
    const ids = mapping.unitIds;
    if (!Array.isArray(ids) || !ids.length || capacities.has(mapping.roomCode)) throw new Error('Invalid inventory mapping snapshot.');
    for (const id of ids) {
      if (assigned.has(id)) throw new Error('A unit appears in multiple inventory mappings.');
      assigned.add(id);
    }
    capacities.set(mapping.roomCode, ids.length);
  }
  if (!capacities.size || !job.updates?.length) throw new Error('No mapped inventory to send.');
  const rows = [];
  const ordered = [...job.updates].sort((a,b)=>a.startDate.localeCompare(b.startDate));
  const sampledDates = new Set([...new Set(ordered.map(update=>update.startDate))].slice(0,14));
  for (const update of ordered) {
    const seen = new Set();
    for (const room of update.rooms) {
      const capacity = capacities.get(room.roomCode);
      if (capacity == null || seen.has(room.roomCode) || !Number.isInteger(room.available) || room.available < 0 || room.available > capacity) {
        throw new Error(`${room.roomCode}: outgoing availability exceeds mapped capacity or has invalid data. Nothing was sent for inventory.`);
      }
      seen.add(room.roomCode);
      if (sampledDates.has(update.startDate) && rows.length < 60) rows.push({date: update.startDate, roomCode: room.roomCode, mappedUnits: capacity, sent: room.available});
    }
    if (seen.size !== capacities.size) throw new Error('Outgoing inventory is missing a mapped category.');
  }
  return {hotelCode: job.hotelCode, revision: job.revision, rows};
}

export function compareInventory(trace, response) {
  if (response?.hotelCode !== trace.hotelCode || !Array.isArray(response.updates)) throw new Error('Unrecognized inventory read-back.');
  const rows = trace.rows.map(row => {
    const values = response.updates.filter(update => update.startDate <= row.date && update.endDate >= row.date)
      .flatMap(update => (update.rooms || []).filter(room => room.roomCode === row.roomCode).map(room => room.available));
    const valid = values.length > 0 && values.every(value => Number.isInteger(value) && value >= 0 && value === values[0]);
    const received = valid ? values[0] : null;
    return {...row, received, match: received === row.sent};
  });
  return {status: rows.every(row => row.match) ? 'matched' : 'different', rows};
}
