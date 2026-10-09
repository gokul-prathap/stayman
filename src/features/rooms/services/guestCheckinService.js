import { createClient } from '@supabase/supabase-js';
import { validateGuestDetails } from '../utils/guestCheckinValidation';

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

export async function openPublicCheckin() {
  await ensureGuestSession();
  const { data, error } = await client().rpc('start_public_guest_checkin');
  if (error) throw error;
  return data;
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
  const cleaned = validateGuestDetails(details);
  if (!invitation || invitation.status !== 'draft') throw new Error('This invitation is not open for uploads.');
  // Validate both slots before any network writes, so a missing/invalid second
  // photo does not upload the first one unnecessarily.
  for (const side of ['front', 'back']) {
    if (!photos[side] || photos[side].type !== 'image/jpeg' || photos[side].size > 1024 * 1024 || photos[side].size === 0) {
      throw new Error('Please choose both compressed document photos (maximum 1 MB each).');
    }
  }
  for (const side of ['front', 'back']) {
    if (!photos[side]) throw new Error('Please choose both document photos.');
    const { error } = await client().storage.from('guest-identities')
      .upload(`${invitation.id}/${side}.jpg`, photos[side], {
        upsert: true, contentType: 'image/jpeg', cacheControl: '0',
      });
    if (error) throw error;
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
