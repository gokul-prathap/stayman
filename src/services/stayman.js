import { supabase } from './supabase';
export {databaseError} from './databaseErrors';
export function db() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
export async function staffProperties() {
  const { data, error } = await db().from('stayman_properties').select('*').order('name');
  if (error) throw error;
  return data;
}
export async function createBooking(unitId, details) {
  const { data, error } = await db().rpc('stayman_create_booking', { p_unit: unitId, p_details: details });
  if (error) throw error;
  return data;
}
export async function markMaintenance(unitId, day, reason) {
  const { error } = await db().rpc('stayman_mark_maintenance', { p_unit: unitId, p_day: day, p_reason: reason });
  if (error) throw error;
}
export async function moveNight(allocationId, targetId, day) {
  const { error } = await db().rpc('stayman_move_night', { p_allocation: allocationId, p_target: targetId, p_day: day });
  if (error) throw error;
}

async function mutation(name, args) {
  const { data, error } = await db().rpc(name,args);
  if (error) throw error;
  return data;
}
export const recordPayment = (reservationId,amount,method,note,requestId) =>
  mutation('stayman_record_payment',{p_reservation:reservationId,p_amount:amount,p_method:method,p_note:note,p_request:requestId});
export const saveRates = (propertyId,rates) =>
  mutation('stayman_save_rates',{p_property:propertyId,p_rates:rates});
export const saveSettings = (propertyId,details) =>
  mutation('stayman_save_settings',{p_property:propertyId,p_details:details});

export const checkInReservation = id => mutation('stayman_check_in',{p_reservation:id});
export const cancelReservation = (id,reason) => mutation('stayman_cancel',{p_reservation:id,p_reason:reason});
export const transferReservation = (id,target,from,to,total,newTotal,request) =>
 mutation('stayman_transfer',{p_reservation:id,p_target:target,p_from:from,p_to:to,p_expected_total:total,p_expected_new_total:newTotal,p_request:request});
export const recordRefund = (id,amount,method,note,request) =>
 mutation('stayman_refund',{p_reservation:id,p_amount:amount,p_method:method,p_note:note,p_request:request});

export const addBookingMember=(id,name,request)=>mutation('stayman_add_member',{p_reservation:id,p_name:name,p_request:request});
export const reissueBookingMember=id=>mutation('stayman_reissue_member',{p_member:id});
export const editReservation=(id,details,expected)=>mutation('stayman_edit_reservation',{p_reservation:id,p_details:details,p_expected:expected});

export const attachWalkin=(id,invitation,asContact=false)=>mutation('stayman_attach_walkin',{p_reservation:id,p_invitation:invitation,p_as_contact:asContact});
export const guestCheckinLink=id=>mutation('stayman_guest_checkin_link',{p_guest:id});
export const bindBookingMember=(guest,member)=>mutation('stayman_bind_member',{p_guest:guest,p_member:member});

export const guestDirectory=(property,search,filter,checkin,page,size,dateFrom='',dateTo='',dateField='arrival')=>mutation('stayman_guest_directory',{p_property:property,p_search:search,p_filter:filter,p_checkin:checkin,p_page:page,p_size:size,p_date_from:dateFrom||null,p_date_to:dateTo||null,p_date_field:dateField});
export const guestProfile=(property,kind,id)=>mutation('stayman_guest_profile',{p_property:property,p_kind:kind,p_id:id});
export const renameGuest=(property,kind,id,name)=>mutation('stayman_rename_guest',{p_property:property,p_kind:kind,p_id:id,p_name:name});
export const releaseMaintenance=id=>mutation('stayman_release_maintenance',{p_allocation:id});
export const extendStay=(id,target,depart,checkout,total,extra,request)=>mutation('stayman_extend_stay',{p_reservation:id,p_target:target,p_depart:depart,p_expected_checkout:checkout,p_expected_total:total,p_expected_extra:extra,p_request:request});
