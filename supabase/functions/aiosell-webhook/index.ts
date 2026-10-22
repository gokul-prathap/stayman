import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
import {basicMatches, normalizeReservation} from '../_shared/aiosell.mjs';

Deno.serve(async request => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
  if (request.method !== 'POST') return reply({success: false, message: 'POST required.'}, 405);
  if (!await basicMatches(request.headers.get('authorization'), Deno.env.get('AIOSELL_WEBHOOK_USERNAME'), Deno.env.get('AIOSELL_WEBHOOK_PASSWORD'))) return reply({success: false, message: 'Unauthorized.'}, 401);
  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > 262144) return reply({success: false, message: 'Payload too large.'}, 413);
    const payload = normalizeReservation(JSON.parse(body));
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {auth: {persistSession: false}});
    const {data, error} = await service.rpc('stayman_aiosell_receive', {p_payload: payload});
    // Never acknowledge success unless the database durably accepted the event.
    if (error) return reply({success: false, message: 'Reservation could not be received. Verify hotel setup or retry.'}, 503);
    return reply(data);
  } catch {
    return reply({success: false, message: 'Invalid reservation payload.'}, 400);
  }
});
