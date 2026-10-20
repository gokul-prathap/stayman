// Isolated Chromium QA: actual local app routes plus a gallery of application classes.
// No account, authentication token or remote API is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,readdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {spawn} from 'node:child_process';
const browser=process.env.THEME_QA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const output=await mkdtemp(join(tmpdir(),'stayman-theme-')),dist=resolve('dist'),assets=await readdir(join(dist,'assets'));
const styles=assets.filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/assets/${name}">`).join('');
const gallery=`<!doctype html><html data-theme="dark"><head><meta charset="utf-8">${styles}<meta name="theme-color" content="#0d1422"></head><body><main class="management" style="padding:28px;max-width:1100px"><header class="stayman-topbar" style="padding:16px;margin-bottom:20px"><h1>Stayman · Theme preview</h1></header><section class="card space-y-4"><h1>Property workspace</h1><p class="muted">Rooms, guests and reservations in one place.</p><div class="grid grid-cols-3 gap-4"><label>Guest name<input value="Sample guest"></label><label>Arrival<input type="date" value="2026-10-21"></label><label>Payment<select><option>UPI</option></select></label></div><div class="flex gap-3"><button class="primary">Save reservation</button><button class="secondary">Cancel</button><span class="bg-emerald-100 text-emerald-700 rounded-lg p-3">Checked in</span></div><p class="notice">Your billing draft is ready for review.</p><p class="error">This bed is unavailable for the selected dates.</p><table><thead><tr><th>Guest</th><th>Room</th><th>Balance</th></tr></thead><tbody><tr><td>Sample guest</td><td>Pepper / Bed 2</td><td>₹1,500</td></tr></tbody></table></section><section class="stay-view" style="margin-top:20px"><div class="stay-toolbar"><button>Today</button><button class="stay-primary">New booking</button><input type="date" value="2026-10-21"></div><div class="stay-chart-card p-4"><div class="flex gap-3"><button class="stay-pill occupied">Checked in</button><button class="stay-pill reserved">Reserved</button><button class="stay-pill blocked">Maintenance</button></div></div></section><section class="billing-folio" style="margin-top:20px"><h2>Invoice preparation</h2><div class="billing-totals"><div><small>Total</small><strong>₹2,500</strong></div><div><small>Paid</small><strong>₹1,000</strong></div><div><small>Balance</small><strong>₹1,500</strong></div></div></section></main></body></html>`;
const server=createServer(async(req,res)=>{try{if(req.url==='/theme-gallery'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(gallery);return;}const path=resolve(dist,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(dist+sep)&&path!==dist){res.writeHead(403);res.end();return;}const file=extname(path)?path:join(dist,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
const processHandle=spawn(browser,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${join(output,'profile')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
let socket;
try{
 let port;
 for(let i=0;i<100;i++){try{port=(await readFile(join(output,'profile','DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await new Promise(done=>setTimeout(done,100));}}
 if(!port)throw new Error('Chromium did not start. Set THEME_QA_BROWSER to its executable.');
 const page=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(origin)}`,{method:'PUT'})).json();
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((done,reject)=>{socket.addEventListener('open',done);socket.addEventListener('error',reject);});
 let seq=0;const pending=new Map();socket.addEventListener('message',event=>{const result=JSON.parse(event.data);const item=pending.get(result.id);if(item){pending.delete(result.id);result.error?item.reject(new Error(result.error.message)):item.resolve(result.result);}});
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const value=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.text);return value.result.value;};
 const waitFor=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await new Promise(done=>setTimeout(done,100));}throw new Error('Timed out waiting for '+expression);};
 await call('Page.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['https://*.supabase.co/*','https://*.supabase.in/*']});
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:980,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:origin+'/'});await waitFor("!!document.querySelector('.theme-toggle')");
 await evaluate("document.querySelector('.theme-toggle').click()");const chosen=await evaluate("document.documentElement.dataset.theme");
 assert.equal(await evaluate("localStorage.getItem('stayman.theme')"),chosen);
 await call('Page.reload');await waitFor("!!document.querySelector('.theme-toggle')");assert.equal(await evaluate('document.documentElement.dataset.theme'),chosen);
 for(const route of ['/','/godfather','/auth/reset-password','/theme-gallery']){
  await call('Page.navigate',{url:origin+route});await waitFor(route==='/theme-gallery'?"!!document.querySelector('.billing-folio')":route==='/'?"!!document.querySelector('.stayman-login')":"!!document.querySelector('.admin-auth-card')");
  await evaluate("document.fonts.ready.then(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))))");
  for(const theme of ['light','dark']){
   await evaluate(`document.documentElement.dataset.theme='${theme}';document.documentElement.style.colorScheme='${theme}'`);
   const image=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,(route==='/'?'login':route.slice(1).replaceAll('/','-'))+'-'+theme+'.png'),Buffer.from(image.data,'base64'));
  }
 }
 const dark=await evaluate("({card:getComputedStyle(document.querySelector('.card')).backgroundColor,text:getComputedStyle(document.querySelector('.card')).color,input:getComputedStyle(document.querySelector('input')).backgroundColor,button:getComputedStyle(document.querySelector('.primary')).backgroundColor})");
 assert.notEqual(dark.card,'rgb(255, 255, 255)');assert.notEqual(dark.input,'rgb(255, 255, 255)');
 await call('Emulation.setEmulatedMedia',{media:'print'});
 assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"),'rgb(255, 255, 255)');
 console.log('PASS toggle persistence, direct routes, dark card/input colours and white print output');console.log('Screenshots: '+output);console.log(JSON.stringify(dark));
}finally{socket?.close();processHandle.kill();await new Promise(done=>server.close(done));}
