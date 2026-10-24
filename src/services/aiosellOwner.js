import {db} from './stayman';
const rpc=async(name,args)=>{const {data,error}=await db().rpc(name,args);if(error)throw error;return data;};
export const aiosellOwnerAdapter={
 load:property=>rpc('stayman_aiosell_owner_state',{p_property:property}),
 async act(property,state,action){
  await rpc('stayman_aiosell_owner_action',{p_property:property,p_action:action.type,p_key:action.key||null,p_open:action.open??null,p_revision:state.revision});
  if(action.type==='auto'&&!action.open)return 'Automatic updates are off. Incoming bookings still arrive. Online sales have not been closed.';
  try{const {data,error}=await db().functions.invoke('aiosell-sync',{body:{property,action:'sync'}});if(error||data?.error)return 'Saved. Delivery is not confirmed yet; refresh or retry if needed.';return data.message||'Saved. Waiting for Aiosell acceptance.';}catch{return 'Saved. Delivery is not confirmed yet.';}
 },
 review:key=>rpc('stayman_aiosell_review',{p_event:key}),
 link:(event,reservation)=>rpc('stayman_aiosell_link_reviewed',{p_event:event,p_reservation:reservation,p_verified:true}),
 create:event=>rpc('stayman_aiosell_create_reviewed',{p_event:event,p_verified:true})
};
