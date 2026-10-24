// Synthetic adapter only. No network calls, secrets or production state.
export function createAiosellPreview(scenario='CONNECTED'){
 const rooms=['MDR Bed 1','MDR Bed 2','MDR Bed 3','MDR Bed 4','MDRA Bed 1','MDRA Bed 2','MDRA Bed 3','MDRA Bed 4','Private Room 101','Private Room 102'].map((name,i)=>({key:'room-'+i,name,category:name.replace('101','').replace('102','2'),price:i<8?60000:i===8?200000:250000,included:true,desiredOpen:true,ackOpen:scenario==='READY'?null:true,pending:false,guestPricing:i<8?null:{includedGuests:2,maxGuests:3,extraGuestPaise:50000}}));
 const state={state:scenario==='ISSUES'?'CONNECTED':scenario,ready:!['UNCONFIGURED','INCOMPLETE'].includes(scenario),approved:['CONNECTED','ISSUES'].includes(scenario),enabled:['CONNECTED','ISSUES'].includes(scenario),autoSync:true,pending:false,deliveryFailed:false,propertyName:'Hostarica',revision:1,lastAcceptedAt:scenario==='READY'?null:'2026-10-24T09:00:00Z',scope:{from:'2026-10-24',through:'2027-01-21'},rooms,excluded:[],sites:[{key:'booking',name:'Booking.com',configured:true,desiredOpen:true,ackOpen:true},{key:'agoda',name:'Agoda',configured:true,desiredOpen:false,ackOpen:false},{key:'expedia',name:'Expedia',configured:false,setupState:'NOT_CONFIGURED',desiredOpen:true,ackOpen:null}],issues:scenario==='ISSUES'?[{key:'issue',reference:'PREVIEW-123',guest:'Example Guest',from:'2026-10-26',through:'2026-10-28',rooms:'Private Room 101',reason:'A suitable room or bed could not be allocated.'}]:[]};
 const adapter={outcome:'success',async load(){return structuredClone(state);},async act(property,before,action){
  if(action.type==='auto'){state.autoSync=action.open;return 'Preview: automatic updates '+(action.open?'on.':'off. Incoming bookings still arrive.');}
  if(action.type==='approve'){state.approved=true;state.enabled=true;state.state='ACTIVATING';}
  if(action.type==='room')state.rooms.find(r=>r.key===action.key).desiredOpen=action.open;
  if(action.type==='site')state.sites.find(s=>s.key===action.key).desiredOpen=action.open;
  if(action.type==='stop_all')state.rooms.forEach(r=>r.desiredOpen=false);
  state.pending=true;state.rooms.forEach(r=>r.pending=r.desiredOpen!==r.ackOpen);state.sites.forEach(s=>s.pending=s.configured&&s.desiredOpen!==s.ackOpen);
  await new Promise(resolve=>setTimeout(resolve,650));
  if(adapter.outcome==='failure'){state.deliveryFailed=true;return 'Simulated failure. Choices are saved; previous acknowledgements remain.';}
  if(adapter.outcome==='unconfirmed'){state.deliveryFailed=false;return 'Simulated delivery: awaiting confirmation. No acknowledgement is assumed.';}
  state.rooms.forEach(r=>{r.ackOpen=r.desiredOpen;r.pending=false;});
  if(adapter.outcome==='partial'){state.deliveryFailed=true;return 'Simulated partial delivery: room availability accepted; booking-site rules need attention.';}
  state.sites.filter(s=>s.configured).forEach(s=>{s.ackOpen=s.desiredOpen;s.pending=false;});state.pending=false;state.deliveryFailed=false;state.state='CONNECTED';state.lastAcceptedAt=new Date().toISOString();return 'Simulated update accepted by Aiosell. This is not live OTA confirmation.';
 },async review(){return {reference:'PREVIEW-123',guest:'Example Guest',from:'2026-10-26',through:'2026-10-28',total:400000,canCreate:true,candidates:[{key:'existing',reference:'ST-PREVIEW',guest:'Example Guest',from:'2026-10-26',through:'2026-10-28',total:400000,rooms:'Private Room 101',status:'PENDING'}]};},async link(){state.issues=[];},async create(){if(adapter.outcome==='failure')throw new Error('Simulated availability conflict. Choose another allocation from Reservations.');state.issues=[];}};
 return adapter;
}
