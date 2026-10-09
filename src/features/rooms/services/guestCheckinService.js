import { supabase } from '../../../services/supabase';

export function client() {
  if (!supabase) throw new Error('Guest check-in is not configured. Please contact reception.');
  return supabase;
}

export async function compressIdentityImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP photo.');
  }
  if (file.size > 10 * 1024 * 1024) throw new Error('Each original photo must be 10 MB or smaller.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error('Photo resolution is too large.');
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.48]) {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= 1024 * 1024) return blob;
    }
    throw new Error('Photo cannot be compressed below 1 MB. Choose a smaller photo.');
  } finally {
    bitmap.close();
  }
}

export async function claimInvitation(token) {
  const { data, error } = await client().rpc('claim_guest_checkin', { invitation_token: token });
  if (error) throw error;
  return data;
}

export async function submitGuestCheckin(invitation, details, photos) {
  for (const side of ['front', 'back']) {
    if (!photos[side]) throw new Error('Please choose both document photos.');
    const { error } = await client().storage.from('guest-identities')
      .upload(`${invitation.id}/${side}.jpg`, photos[side], {
        upsert: true, contentType: 'image/jpeg', cacheControl: '0',
      });
    if (error) throw error;
  }
  const { data, error } = await client().rpc('complete_guest_checkin', {
    invitation_id: invitation.id, guest_details: details,
  });
  if (error) throw error;
  return data;
}

// Future server-side hook: evaluate a trusted request IP or property-network
// signal before claiming an invitation. Browsers cannot reliably expose Wi-Fi
// identity; shared IPs must never be used as proof of guest identity or ownership.
// Keep authenticated invitation status as the source of "already uploaded".
