import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {transform} from 'esbuild';
const source=await readFile(new URL('../supabase/functions/invite-staff/index.ts',import.meta.url),'utf8');
const {code}=await transform(source.replace(/^import .*;\r?\n/,''),{loader:'ts',target:'es2022'});
function setup({admin=true,existing=false,assignmentError=false}={}){
 let handler;const calls=[];
 const update=()=>({eq(){return this;},then(resolve){resolve({error:null});}});
 const caller={auth:{getUser:async()=>({data:{user:{id:'admin'}},error:null})},rpc:async(name)=>{calls.push(name);if(name==='stayman_is_platform_admin')return {data:admin};if(name==='stayman_prepare_staff_invitation')return {data:{id:'invite',email:'manager@example.test',user_id:existing?'manager':null}};return {error:assignmentError?new Error('assignment failed'):null};}};
 const service={auth:{admin:{inviteUserByEmail:async()=>{calls.push('invite-email');return {data:{user:{id:'manager'}}};}},resetPasswordForEmail:async()=>{calls.push('reset-email');return {};}},from:()=>({update})};
 runInNewContext(code,{Deno:{env:{get:key=>({STAFF_INVITE_ALLOWED_ORIGINS:'http://localhost:5173',SUPABASE_URL:'https://example.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'secret'})[key]},serve:fn=>handler=fn},createClient:(_url,key)=>key==='secret'?service:caller,Response});
 const request=(origin='http://localhost:5173')=>new Request('https://example.test/functions/v1/invite-staff',{method:'POST',headers:{origin,authorization:'Bearer verified', 'Content-Type':'application/json'},body:JSON.stringify({email:'manager@example.test',property:'property',role:'MANAGER'})});
 return {handler,calls,request};
}
test('invitation function rejects unknown origins and non-admin callers before sending mail',async()=>{
 const a=setup();assert.equal((await a.handler(a.request('https://untrusted.test'))).status,403);assert.deepEqual(a.calls,[]);
 const b=setup({admin:false});assert.equal((await b.handler(b.request())).status,403);assert.deepEqual(b.calls,['stayman_is_platform_admin']);
});
test('new-account invitation creates user and assigns access using authorized caller',async()=>{
 const {handler,calls,request}=setup();const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(calls,['stayman_is_platform_admin','stayman_prepare_staff_invitation','invite-email','stayman_admin_add_staff']);assert.equal(JSON.stringify(await response.json()).includes('secret'),false);
});
test('existing-account invitation assigns access and sends a reset link without recreating user',async()=>{
 const {handler,calls,request}=setup({existing:true});assert.equal((await handler(request())).status,200);assert.ok(!calls.includes('invite-email'));assert.ok(calls.includes('reset-email'));
});
test('partial assignment failure is surfaced without exposing internal error details',async()=>{
 const {handler,request}=setup({assignmentError:true});const response=await handler(request());assert.equal(response.status,502);assert.match((await response.json()).error,/setup did not finish/);
});
