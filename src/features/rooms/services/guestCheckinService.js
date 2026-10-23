import {identityUploadSides} from '../utils/identityPolicy.js';
import { createClient } from '@supabase/supabase-js';
import { validateGuestDetails } from '../utils/guestCheckinValidation';
import {screenIdentityPhoto} from '../utils/identityScreening';

// Separate guest sessions from staff sign-ins and ignore email magic-link callbacks.
const guestClient = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { storageKey: 'stayman-guest-checkin', detectSessionInUrl: false },
  }) : null;

let sessionPromise;
async function ensureGuestSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data, error } = await client().auth.getSession();
      if (error) throw error;
      if (data.session) return;
      const { error: signInError } = await client().auth.signInAnonymously();
      if (signInError) throw new Error('Unable to start guest check-in. Reception must enable Supabase anonymous sign-ins. ' + signInError.message);
    })().finally(() => { sessionPromise = null; });
  }
  return sessionPromise;
}

export async function openInvitation(token) {
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error('Invalid invitation link. Please contact reception.');
  await ensureGuestSession();
  return claimInvitation(token);
}

export function guestError(error) {
  const message = error?.message || 'Unable to complete check-in. Please contact the manager.';
  if (/daily check-in limit/i.test(message)) return 'Daily check-in limit reached. Please contact the manager.';
  if (error?.status === 402 || String(error?.statusCode) === '402' || /quota|storage.*full|capacity|disk.*full/i.test(message)) {
    return 'Uploads are currently unavailable because storage is full. Please contact the manager.';
  }
  if (/start_public_guest_checkin|schema cache/i.test(message)) {
    return 'Guest check-in is not ready yet. Please contact the manager.';
  }
  return message;
}

export async function openPublicCheckin(propertyId) {
  await ensureGuestSession();
  const { data, error } = await client().rpc('start_public_guest_checkin', propertyId ? {p_property:propertyId} : {});
  if (error) throw error;
  return data;
}

let nextGuestPromise;
export function startNextPublicCheckin(propertyId){
  // Rotate only the isolated guest session. Staff authentication is untouched.
  // Never reuse or overwrite the completed invitation and its documents.
  if(!propertyId)return Promise.reject(new Error('Scan the property QR code to start another check-in.'));
  if(!nextGuestPromise)nextGuestPromise=(async()=>{
    const {error}=await client().auth.signOut({scope:'local'});
    if(error)throw error;
    return openPublicCheckin(propertyId);
  })().finally(()=>{nextGuestPromise=null;});
  return nextGuestPromise;
}

export function client() {
  if (!guestClient) throw new Error('Guest check-in is not configured. Please contact reception.');
  return guestClient;
}

export { compressIdentityImage } from '../utils/identityImage';

export async function claimInvitation(token) {
  const { data, error } = await client().rpc('claim_guest_checkin', { invitation_token: token });
  if (error) throw error;
  return data;
}

export async function submitGuestCheckin(invitation, details, photos) {
  const cleaned = validateGuestDetails(details, invitation?.linked ? invitation.arrival_date : undefined);
  if (!invitation || invitation.status !== 'draft') throw new Error('This invitation is not open for uploads.');
  const sides=identityUploadSides(cleaned,photos);
  // Validate all required and supplied slots before any network writes.
  for (const side of sides) {
    if (!photos[side] || photos[side].type !== 'image/jpeg' || photos[side].size > 1024 * 1024 || photos[side].size === 0) {
      throw Object.assign(new Error('Please choose the required compressed document photos (maximum 1 MB each).'),{photoSide:side});
    }
  }
  cleaned.document_sides=sides;
  cleaned.document_screening={};
  for (const side of sides) {
    if (!photos[side]) throw Object.assign(new Error('Please choose the required document photos.'),{photoSide:side});
    const screening=await screenIdentityPhoto(photos[side],{side,foreign:cleaned.foreign_guest}).catch(error=>{throw Object.assign(new Error(error.message),{photoSide:side});});
    if(screening.reason==='pan-not-accepted')throw Object.assign(new Error('PAN cards are not accepted. Upload another identity document.'),{photoSide:side});
    if(!screening.accepted&&!screening.manualReview)throw Object.assign(new Error('Review the cropped photo or choose reception review before submitting.'),{photoSide:side});
    cleaned.document_screening={...cleaned.document_screening,[side]:screening.manualReview?'manual-review':'document-like'};
  }
  for (const side of sides) {
    const { error } = await client().storage.from('guest-identities')
      .upload(`${invitation.id}/${side}.jpg`, photos[side], {
        upsert: true, contentType: 'image/jpeg', cacheControl: '0',
      });
    if (error) throw Object.assign(new Error(error.message),error,{photoSide:side});
  }
  const { data, error } = await client().rpc('complete_guest_checkin', {
    invitation_id: invitation.id, guest_details: cleaned,
  });
  if (error) throw error;
  return data;
}

// Future server-side hook: evaluate a trusted request IP or property-network
// signal before claiming an invitation. Browsers cannot reliably expose Wi-Fi
// identity; shared IPs must never be used as proof of guest identity or ownership.
// Keep authenticated invitation status as the source of "already uploaded".

export async function loadPublicProperty(propertyId, token) {
  const { data, error } = await client().rpc('guest_property_profile', {
    p_property: propertyId || null, p_invitation_token: token || null,
  });
  if (error) throw error;
  return data;
}
