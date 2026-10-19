export function registerDate(value){
 if(!value)return '—';
 const date=new Date(value+'T12:00:00Z');
 return Number.isNaN(date.getTime())?'—':date.toLocaleDateString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});
}
export function registerRooms(row){
 const labels=[...new Set((row.rooms||[]).map(room=>[room.room,room.unit].filter(Boolean).join(' / ')).filter(Boolean))];
 return {label:labels[0]||(row.kind==='walkin'?'Not allocated':'—'),extra:Math.max(0,labels.length-1),title:(row.rooms||[]).map(room=>`${room.room} / ${room.unit}: ${room.from} to ${room.to}`).join('\n')};
}
export function registerDocuments(row){
 if(!row.web_done)return {label:'Not submitted',tone:'pending'};
 const screening=row.document_screening;
 if(screening&&Object.values(screening).includes('manual-review'))return {label:'Review required',tone:'review'};
 if(screening?.front==='document-like'&&screening?.back==='document-like')return {label:'Text detected',tone:'submitted'};
 return {label:'Submitted',tone:'submitted'};
}
export function registerStay(row){
 return ({walkin:'Awaiting allocation',current:'Current',future:'Upcoming',past:'Past'})[row.stay]||row.stay||'—';
}
