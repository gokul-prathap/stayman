// Explicitly synthetic development adapter. Never imports a database or network client.
export function createAdminPreview(scenario='CONNECTED'){
 const property={id:'admin-preview-'+scenario,name:'Example property',timezone:'Asia/Kolkata'};
 const units=[{id:'bed-1',roomName:'Mixed dorm',label:'Bed 1',type:'BED',genderPolicy:'ANY',nightlyRatePaise:60000},{id:'bed-2',roomName:'Mixed dorm',label:'Bed 2',type:'BED',genderPolicy:'ANY',nightlyRatePaise:60000},{id:'private-1',roomName:'Private room',label:'Room 101',type:'ROOM',genderPolicy:'ANY',nightlyRatePaise:200000}];
 const remote=hotel=>({hotel_id:hotel,hotel_name:hotel==='example-hotel'?'Example property':'Proposed property',currency:'INR',timezone:'Asia/Kolkata',rooms:[{room_id:'dorm',room_name:'Shared dorm category',rateplans:[{rateplan_id:'dorm-base'}]},{room_id:'private',room_name:'Private room category',max_occ:3,rateplans:[{rateplan_id:'private-base',occupancy:2},{rateplan_id:'private-extra',occupancy:3}]}],connected_channels:[{partner_id:'example-target',operation:'inventory'}]});
 const mappings=[{mappingId:'dorm-match',roomCode:'dorm',roomName:'Shared dorm category',unitIds:['bed-1','bed-2'],rateplanCode:'dorm-base',ratePlans:[{rateplanCode:'dorm-base',rateSource:'pricing'}],minimumStay:1,stopSell:false},{mappingId:'private-match',roomCode:'private',roomName:'Private room category',unitIds:['private-1'],rateplanCode:'private-base',ratePlans:[{rateplanCode:'private-base',rateSource:'occupancy',guestCount:2},{rateplanCode:'private-extra',rateSource:'occupancy',guestCount:3}],minimumStay:1,stopSell:true,guestPricing:{includedGuests:2,maxGuests:3,extraGuestPaise:50000}}];
 let connection=scenario==='UNCONFIGURED'?null:{hotel_code:'example-hotel',enabled:!['INCOMPLETE','READY'].includes(scenario),approved:!['INCOMPLETE','READY'].includes(scenario),setup_verified:true,auto_sync:true,revision:1,synced_revision:1,mappings:scenario==='INCOMPLETE'?[]:structuredClone(mappings),restriction_channels:[]},transition=null;
 const api={outcome:'success',async rpc(name,args){
  if(name==='stayman_aiosell_settings')return structuredClone({connection,remote:connection?remote(connection.hotel_code):null,sites:[],events:[]});
  if(name==='stayman_admin_mapping_change'){
   if(args.p_action==='state')return structuredClone(transition);
   if(args.p_action==='begin'){
    if(scenario==='LINKED_BOOKINGS'&&args.p_hotel!==connection.hotel_code)throw new Error('Hotel code cannot change after receiving bookings. Resolve linked booking dependencies; no bookings were detached.');
    transition={id:'change',old_hotel:connection.hotel_code,hotel:args.p_hotel,mappings:structuredClone(args.p_mappings),was_approved:connection.approved};
    connection.mappings.forEach(m=>m.stopSell=true);connection.revision++;return structuredClone(transition);
   }
   if(args.p_action==='cancel'){transition=null;return {stage:'cancelled'};}
   if(args.p_action==='apply'){
    if(!args.p_verified||connection.last_sync_results?.stages.inventory.status!=='sent')throw new Error('Old inventory closure has not been accepted. Retry closure.');
    const restart=transition.was_approved&&transition.hotel===transition.old_hotel;
    connection.hotel_code=transition.hotel;connection.mappings=transition.mappings.map(m=>({...m,stopSell:mappings.find(old=>old.roomCode===m.roomCode)?.stopSell??m.stopSell}));connection.approved=restart;connection.enabled=restart;connection.revision++;transition=null;return {stage:'saved',restart};
   }
  }
  if(name==='stayman_aiosell_configure'){connection={...connection,hotel_code:args.p_hotel,mappings:structuredClone(args.p_mappings),enabled:false,approved:false,setup_verified:true,auto_sync:true,revision:(connection?.revision||0)+1};return null;}
  if(name==='stayman_aiosell_channels')return null;
  if(name==='stayman_aiosell_site_setup')throw new Error('This simulated target is setup-incomplete. Provision and verify real capability with Aiosell.');
  throw new Error('Unsupported simulated action.');
 },async invoke(body){
  if(body.action==='mapping'){if(scenario==='FETCH_FAILED')throw new Error("Couldn't check setup. Saved matches remain unchanged.");return remote(body.hotelCode);}
  const accepted=api.outcome==='success'||api.outcome==='partial';
  const results={inventory:{status:accepted?'sent':api.outcome==='failure'?'failed':'pending',message:accepted?'Simulated Aiosell acceptance.':'Simulated delivery not accepted.'},rates:{status:transition?'skipped':accepted?'sent':'pending',message:'Simulation only.'},restrictions:{status:api.outcome==='success'?'sent':'pending',message:'No live OTA confirmation.'}};
  connection.last_sync_results={revision:connection.revision,stages:results};connection.last_error=api.outcome==='success'?null:'Simulated delivery needs attention';if(accepted)connection.synced_revision=connection.revision;
  return {status:api.outcome==='success'?'complete':'partial',results,message:'Simulated '+api.outcome+'; no live request was made.'};
 }};
 const owner={async load(){if(!connection)return {state:'UNCONFIGURED',ready:false};const ready=connection.mappings.length>0;return {propertyName:property.name,state:ready?connection.approved?'CONNECTED':'READY':'INCOMPLETE',ready,approved:connection.approved,autoSync:connection.auto_sync,revision:connection.revision,pending:false,deliveryFailed:!!connection.last_error,rooms:connection.mappings.map(m=>({key:m.mappingId||m.roomCode,name:m.unitIds.map(id=>units.find(u=>u.id===id)?.label).join(', '),category:m.roomName||m.roomCode,price:units.find(u=>m.unitIds.includes(u.id))?.nightlyRatePaise,desiredOpen:!m.stopSell,ackOpen:connection.approved?!m.stopSell:null,guestPricing:m.guestPricing})),sites:[{key:'site',name:'Example booking site',configured:false,setupState:'INCOMPLETE',ackOpen:null}],issues:[],excluded:[],scope:{from:'2026-10-24',through:'2027-01-21'}};}};
 return {property,units,api,owner};
}
