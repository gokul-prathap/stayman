export function validateAiosellMappings(mappings) {
  const seen = new Map();
  return mappings.map((mapping, index) => {
    const roomCode = String(mapping.roomCode || '').trim();
    const rateplanCode = String(mapping.rateplanCode || '').trim();
    const label = `Room mapping ${index + 1}`;
    if (!roomCode) throw new Error(`${label}: enter an Aiosell room code, or remove this unfinished mapping.`);
    if (roomCode.length > 120) throw new Error(`${label}: the Aiosell room code must be 120 characters or fewer.`);
    if (seen.has(roomCode)) throw new Error(`Room mappings ${seen.get(roomCode)} and ${index + 1} both use room code "${roomCode}". Each Aiosell room code can appear only once, even with different rate plans.`);
    seen.set(roomCode, index + 1);
    if (!rateplanCode) throw new Error(`${label}: enter the Aiosell rate-plan code.`);
    if (rateplanCode.length > 120) throw new Error(`${label}: the Aiosell rate-plan code must be 120 characters or fewer.`);
    return {...mapping, roomCode, rateplanCode};
  });
}
