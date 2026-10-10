import { supabase } from './supabase';
export function db() {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase;
}
export function databaseError(error) {
  if (error?.code === '23P01') return 'This bed is occupied or under maintenance for the selected dates. Refresh and choose another bed.';
  if (/schema cache|does not exist/i.test(error?.message || '')) return 'Database setup is missing. Apply Stayman migrations 006 through 010, then configure the property.';
  return error?.message || 'Unable to save. Please try again.';
}
export async function staffProperties() {
  const { data, error } = await db().from('stayman_properties').select('*').order('name');
  if (error) throw error;
  return data;
}
async function allRows(table, propertyId) {
  const rows = [];
  for (let offset=0;;offset+=1000) {
    const { data, error } = await db().from(table).select('*').eq('property_id',propertyId).order('id').range(offset,offset+999);
    if (error) throw error;
    rows.push(...data);
    if (data.length<1000) return { data:rows };
  }
}
export async function loadPropertyData(propertyId) {
  const results = await Promise.all([
    allRows('stayman_units',propertyId),allRows('stayman_guests',propertyId),
    allRows('stayman_reservations',propertyId),allRows('stayman_allocations',propertyId),
    allRows('stayman_payments',propertyId),
    db().rpc('stayman_is_owner',{p_property:propertyId}),
    db().rpc('stayman_team',{p_property:propertyId}),
    db().rpc('stayman_member_details',{p_property:propertyId}),
    db().rpc('stayman_walkins',{p_property:propertyId}),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [unitResult, guestResult, reservationResult, allocationResult] = results;
  const units = unitResult.data.sort((a,b) => (a.room_name+a.label).localeCompare(b.room_name+b.label)).map(u => ({ id: u.id, label: u.label, roomName: u.room_name,
    category: u.unit_type === 'BED' ? 'DORMITORY' : 'PRIVATE', type: u.unit_type, genderPolicy: u.gender_policy, nightlyRatePaise: Number(u.nightly_rate_paise || 0) }));
  const guests = guestResult.data.sort((a,b) => b.created_at.localeCompare(a.created_at));
  const reservations = reservationResult.data.sort((a,b) => b.created_at.localeCompare(a.created_at));
  const allocations = allocationResult.data.map(a => {
    const r = reservations.find(r => r.id === a.reservation_id);
    const g = guests.find(g => g.id === r?.guest_id);
    return { id: a.id, unitId: a.unit_id, reservationId: r?.booking_ref, reservationDbId: r?.id,
      guestName: g?.full_name, phone: g?.phone, gender: g?.gender, nationality: g?.nationality,
      chargePaise: a.charge_paise == null ? undefined : Number(a.charge_paise), checkInDate: a.check_in_date, checkOutDate: a.check_out_date, status: a.status,
      totalAmount: (r?.total_amount || 0) / 100, paidAmount: (r?.paid_amount || 0) / 100, reason: a.reason };
  });
  return { units, guests, reservations, allocations, payments: results[4].data.sort((a,b) => b.paid_at.localeCompare(a.paid_at)), isOwner: results[5].data, team: results[6].data, members:results[7].data || [], walkins:results[8].data || [] };
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
