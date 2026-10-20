import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';

// Deploy with JWT verification disabled at the gateway only when using new publishable keys.
// This function always validates the user and the database admin policy itself.
Deno.serve(async request=>{
 const allowed=(Deno.env.get('STAFF_INVITE_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean);
 const origin=request.headers.get('origin')||'';
 const headers={'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'null','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
 if(!allowed.includes(origin))return reply({error:'This app URL is not enabled for invitations. Configure STAFF_INVITE_ALLOWED_ORIGINS.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Method not allowed.'},405);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const authorization=request.headers.get('authorization')||'';
 const caller=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:identity,error:identityError}=await caller.auth.getUser();
 if(identityError||!identity.user)return reply({error:'Sign in again before inviting a team member.'},401);
 const {data:isAdmin,error:adminError}=await caller.rpc('stayman_is_platform_admin');
 if(adminError||isAdmin!==true)return reply({error:'Platform administrator access required.'},403);
 let body;
 try{body=await request.json();}catch{return reply({error:'Invalid request.'},400);}
 if(!body||typeof body.email!=='string'||typeof body.property!=='string'||!['MANAGER','OWNER'].includes(body.role))return reply({error:'Choose a property, email and role.'},400);
 const {data:invite,error:prepareError}=await caller.rpc('stayman_prepare_staff_invitation',{p_property:body.property,p_email:body.email,p_role:body.role});
 if(prepareError)return reply({error:prepareError.message},400);
 const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const redirectTo=origin+'/auth/set-password';
 let userId=invite.user_id;
 let sent=false;
 try{
  if(!userId){
   const {data,error}=await service.auth.admin.inviteUserByEmail(invite.email,{redirectTo});
   if(error)throw error;
   userId=data.user?.id;sent=true;
   if(!userId)throw new Error('Invitation did not create an account.');
  }
  // Assign with caller's verified admin context, preserving existing owner roles.
  const {error:assignmentError}=await caller.rpc('stayman_admin_add_staff',{p_property:body.property,p_email:invite.email,p_role:body.role});
  if(assignmentError)throw assignmentError;
  const {error:linkError}=await service.from('stayman_staff_invitations').update({user_id:userId}).eq('id',invite.id);
  if(linkError)throw linkError;
  if(!sent){
   // Existing accounts keep their password; a recovery link lets them choose a new one.
   const {error}=await service.auth.resetPasswordForEmail(invite.email,{redirectTo});
   if(error)throw error;
   sent=true;
  }
  const {error:saveError}=await service.from('stayman_staff_invitations').update({status:'SENT',user_id:userId}).eq('id',invite.id).eq('status','SENDING');
  if(saveError)throw saveError;
  return reply({message:'Invitation sent. The team member can open the email and choose their own password.'});
 }catch(error){
  await service.from('stayman_staff_invitations').update({status:'FAILED',user_id:userId||null}).eq('id',invite.id).eq('status','SENDING');
  // Never return tokens, generated links, service credentials or raw Auth responses.
  const limited=error instanceof Error&&/rate|limit/i.test(error.message);
  return reply({error:limited?'Email rate limit reached. Wait before retrying.':sent?'Email sent, but setup did not finish. Wait one minute, then retry to complete property access.':'Invitation could not be completed. Check Supabase email configuration, then retry. Property access may already be assigned.'},502);
 }
});
