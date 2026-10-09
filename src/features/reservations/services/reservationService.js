import { supabase } from '../../../services/supabase';

export async function fetchUnitsAndRooms() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('bookable_units')
    .select(`
      id,
      unit_label,
      unit_type,
      housekeeping_status,
      room:rooms (
        id,
        name,
        category,
        gender_policy,
        property_id
      )
    `);

  if (error) throw error;
  return data;
}

export async function createReservationInDB({
  guestName,
  phone,
  gender,
  unitId,
  checkInDate,
  checkOutDate,
  totalAmountPaise,
}) {
  if (!supabase) {
    throw new Error('Supabase client is not initialized.');
  }

  // 1. Fetch unit along with room gender policies
  const { data: unitData, error: unitErr } = await supabase
    .from('bookable_units')
    .select('id, room:rooms(property_id, gender_policy, name)')
    .eq('id', unitId)
    .single();

  if (unitErr || !unitData) throw new Error('Unit not found');

  const policy = unitData.room.gender_policy;
  if (policy === 'FEMALE_ONLY' && gender !== 'FEMALE') {
    throw new Error(`Invalid Assignment: ${unitData.room.name} is reserved exclusively for female guests.`);
  }

  const propertyId = unitData.room.property_id;

  // 2. Create Guest with Gender
  const { data: guestData, error: guestErr } = await supabase
    .from('guests')
    .insert({
      property_id: propertyId,
      full_name: guestName,
      phone: phone,
      gender: gender,
      nationality: 'India',
    })
    .select('id')
    .single();

  if (guestErr) throw new Error(`Failed to create guest: ${guestErr.message}`);

  // 3. Create Reservation
  const bookingRef = `RES-${Date.now().toString().slice(-6)}`;
  const { data: resData, error: resErr } = await supabase
    .from('reservations')
    .insert({
      property_id: propertyId,
      guest_id: guestData.id,
      booking_ref: bookingRef,
      status: 'CONFIRMED',
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      total_amount: totalAmountPaise,
      paid_amount: 0,
    })
    .select('id, booking_ref')
    .single();

  if (resErr) throw new Error(`Reservation failed: ${resErr.message}`);

  // 4. Create Allocation
  const { error: allocErr } = await supabase
    .from('allocations')
    .insert({
      reservation_id: resData.id,
      bookable_unit_id: unitId,
      check_in_date: checkInDate,
      check_out_date: checkOutDate,
      status: 'ASSIGNED',
    });

  if (allocErr) {
    await supabase.from('reservations').delete().eq('id', resData.id);
    if (allocErr.code === '23P01' || allocErr.message.includes('exclusion')) {
      throw new Error('DOUBLE_BOOKING_CONFLICT: This unit/bed is already booked for these dates.');
    }
    throw new Error(allocErr.message);
  }

  return resData;
}