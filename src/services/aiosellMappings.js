export function validateAiosellMappings(mappings) {
  const seen = new Map();
  return mappings.map((mapping, index) => {
    const roomCode = String(mapping.roomCode || '').trim();
    const ratePlans = mapping.ratePlans?.map(plan => ({...plan, rateplanCode: String(plan.rateplanCode || '').trim()}));
    const rateplanCode = String(ratePlans?.[0]?.rateplanCode || mapping.rateplanCode || '').trim();
    const label = `Room mapping ${index + 1}`;
    if (!roomCode) throw new Error(`${label}: enter an Aiosell room code, or remove this unfinished mapping.`);
    if (roomCode.length > 120) throw new Error(`${label}: the Aiosell room code must be 120 characters or fewer.`);
    if (seen.has(roomCode)) throw new Error(`Room mappings ${seen.get(roomCode)} and ${index + 1} both use room code "${roomCode}". Each Aiosell room code can appear only once, even with different rate plans.`);
    seen.set(roomCode, index + 1);
    if (!rateplanCode) throw new Error(`${label}: enter the Aiosell rate-plan code.`);
    if (rateplanCode.length > 120) throw new Error(`${label}: the Aiosell rate-plan code must be 120 characters or fewer.`);
    if (ratePlans && (!ratePlans.length || new Set(ratePlans.map(p=>p.rateplanCode)).size!==ratePlans.length || ratePlans.some(p=>!p.rateplanCode || p.rateplanCode.length>120))) throw new Error(`${label}: choose distinct rate plans.`);
    return {...mapping, roomCode, rateplanCode, ...(ratePlans ? {ratePlans} : {})};
  });
}

export const mappingPlans = mapping => mapping.ratePlans || [{rateplanCode:mapping.rateplanCode,rateSource:'pricing'}];
export function validateUnitAssignments(mappings,units){
 const used=new Set();
 for(const mapping of mappings){
  const selected=mapping.unitIds.map(id=>units.find(u=>u.id===id&&!u.archivedAt));
  if(selected.some(u=>!u)||selected.some(u=>used.has(u.id)))throw new Error('Choose distinct active units from this property.');
  selected.forEach(u=>used.add(u.id));
  if(new Set(selected.map(u=>u.type+':'+(u.genderPolicy||'ANY'))).size>1)throw new Error('A shared category cannot mix beds, rooms or gender policies.');
  if(new Set(selected.map(u=>Number(u.nightlyRatePaise))).size>1)throw new Error('Units sharing one category need the same nightly price. Use separate Aiosell categories for different prices.');
 }
 return mappings;
}
const normalized = name => String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Suggest only one exact, unambiguous match; never guess from "Bed 1" across dorms.
export function suggestUnit(room, units, used = []) {
 const names=[normalized(room.room_id),normalized(room.room_name)];
 const matches=units.filter(u=>!u.archivedAt&&!used.includes(u.id)&&[normalized(u.roomName+' '+u.label),normalized(u.label)].some(n=>names.includes(n)));
 return matches.length===1?matches[0].id:null;
}
export function mappingRows(remote, saved, units) {
 const used=saved.flatMap(m=>m.unitIds);
 const rows=(remote.rooms||[]).filter(r=>r.active!==false).map(room=>{
  const existing=saved.find(m=>m.roomCode===room.room_id);
  const suggested=existing?null:suggestUnit(room,units,used);
  if(suggested)used.push(suggested);
  return existing || {roomCode:room.room_id,rateplanCode:room.rateplans?.[0]?.rateplan_id||'',ratePlans:(room.rateplans||[]).map(p=>({rateplanCode:p.rateplan_id,rateSource:'pricing'})),unitIds:suggested?[suggested]:[],minimumStay:1,stopSell:false};
 });
 // Preserve disappeared saved rows until the owner safely closes/removes them.
 return [...rows,...saved.filter(m=>!rows.some(r=>r.roomCode===m.roomCode))];
}
