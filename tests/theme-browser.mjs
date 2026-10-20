// Isolated Chromium QA: actual local app routes plus a gallery of application classes.
// No account, authentication token or remote API is used.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,readdir,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,extname,sep} from 'node:path';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
const browser=process.env.THEME_QA_BROWSER||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const output=await mkdtemp(join(tmpdir(),'stayman-theme-')),dist=resolve('dist'),assets=await readdir(join(dist,'assets'));
const styles=assets.filter(name=>name.endsWith('.css')).map(name=>`<link rel="stylesheet" href="/assets/${name}">`).join('');
const flagDirectory=resolve('node_modules/flag-icons/flags/4x3'),flagURLs={};
for(const filename of await readdir(flagDirectory))if(filename.endsWith('.svg'))flagURLs['/node_modules/flag-icons/flags/4x3/'+filename]='data:image/svg+xml;base64,'+(await readFile(join(flagDirectory,filename))).toString('base64');
const fixture=await build({entryPoints:['tests/fixtures/phone-country.jsx'],bundle:true,write:false,outfile:'phone-qa.js',format:'esm',jsx:'automatic',plugins:[{name:'test-flags',setup(build){build.onLoad({filter:/PhoneCountryPicker\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace(/import\.meta\.glob\([^;]+\)/,JSON.stringify(flagURLs)),loader:'jsx'}));build.onLoad({filter:/\.css$/},()=>({contents:'',loader:'css'}));}}]});
const fixtureJS=fixture.outputFiles.find(file=>file.path.endsWith('phone-qa.js')).text;
let gallery=`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}<meta name="theme-color" content="#0d1422"></head><body><main class="management" style="padding:28px;max-width:1100px"><header class="stayman-topbar" style="padding:16px;margin-bottom:20px"><h1>Stayman · Theme preview</h1></header><section class="card space-y-4"><h1>Property workspace</h1><p class="muted">Rooms, guests and reservations in one place.</p><div class="grid grid-cols-3 gap-4"><label>Guest name<input value="Sample guest"></label><label>Arrival<input type="date" value="2026-10-21"></label><label>Payment<select><option>UPI</option></select></label></div><div class="flex gap-3"><button class="primary">Save reservation</button><button class="secondary">Cancel</button><span class="bg-emerald-100 text-emerald-700 rounded-lg p-3">Checked in</span></div><p class="notice">Your billing draft is ready for review.</p><p class="error">This bed is unavailable for the selected dates.</p><table><thead><tr><th>Guest</th><th>Room</th><th>Balance</th></tr></thead><tbody><tr><td>Sample guest</td><td>Pepper / Bed 2</td><td>₹1,500</td></tr></tbody></table></section><section class="stay-view" style="margin-top:20px"><div class="stay-toolbar"><button>Today</button><button class="stay-primary">New booking</button><input type="date" value="2026-10-21"></div><div class="stay-chart-card p-4"><div class="flex gap-3"><button class="stay-pill occupied">Checked in</button><button class="stay-pill reserved">Reserved</button><button class="stay-pill blocked">Maintenance</button></div></div></section><section class="billing-folio" style="margin-top:20px"><h2>Invoice preparation</h2><div class="billing-totals"><div><small>Total</small><strong>₹2,500</strong></div><div><small>Paid</small><strong>₹1,000</strong></div><div><small>Balance</small><strong>₹1,500</strong></div></div></section></main></body></html>`;
const toolbar=`<header class="stayman-topbar flex min-h-16 flex-wrap items-center justify-between gap-3 py-2 border-b border-slate-200 bg-white px-3 sm:px-6"><div class="topbar-brand flex min-w-0 items-center gap-3"><button class="topbar-control topbar-menu" aria-label="Expand navigation"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor"/></svg></button><div><p class="truncate text-sm font-semibold text-slate-900">Hostarica</p><p class="text-xs text-slate-500">Stayman ? Property management</p></div></div><div class="global-search relative min-w-0 flex-1 max-w-sm"><button class="search-toggle" aria-label="Open search"><svg viewBox="0 0 24 24" width="18" height="18"><circle cx="10" cy="10" r="6" stroke="currentColor" fill="none"/></svg></button><div class="global-search-field flex border p-2"><input placeholder="Search guests"></div></div><div class="topbar-account flex"><button class="theme-toggle" aria-label="Theme"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor"/></svg></button><button class="topbar-control topbar-expense" aria-label="Quick add expense"><svg viewBox="0 0 24 24"><path d="M6 3h12M6 8h12M6 3c10 0 10 10 0 10l10 8" fill="none" stroke="currentColor"/></svg></button><button class="topbar-control topbar-signout">Sign out</button><div class="notification-anchor"><button class="notification-bell" aria-label="Notifications"><svg viewBox="0 0 24 24"><path d="M5 17h14l-2-4V8a5 5 0 0 0-10 0v5z" stroke="currentColor" fill="none"/></svg><span class="notification-count">3</span></button></div><div class="topbar-profile"><a class="topbar-avatar">PM</a></div></div></header>`;
const hero=`<section class="dashboard"><header class="dashboard-hero"><svg class="night-scene dashboard-night-scene" viewBox="0 0 200 200"><circle cx="150" cy="40" r="20" fill="#dbeafe"/><path d="M0 120 70 60 130 130 200 80v120H0" fill="#235aa5"/></svg><div><p class="dashboard-date">Today, Wed, 21 Oct 2026</p><h1>Good morning!</h1><p class="subtitle">Here's what's happening at Hostarica.</p></div><div class="dashboard-day-card"><div><strong>21 Oct 2026</strong><span>Hostarica</span></div><div><span>Check-in 2:00 pm</span><span>Check-out 11:00 am</span></div></div></header></section>`;
gallery=gallery.replace(/<header class="stayman-topbar".*?<\/header>/,'').replace('<body>','<body>'+toolbar).replace('<section class="card space-y-4">',hero+'<section class="card space-y-4">').replace('padding:28px;max-width:1100px','padding:16px;max-width:1100px');
const server=createServer(async(req,res)=>{try{if(req.url==='/phone-picker'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}</head><body><div id="root"></div><script type="module" src="/phone-picker-qa.js"></script></body></html>`);return;}if(req.url==='/phone-picker-qa.js'){res.setHeader('Content-Type','text/javascript');res.end(fixtureJS);return;}if(req.url==='/theme-gallery'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(gallery);return;}const path=resolve(dist,'.'+new URL(req.url,'http://local').pathname);if(!path.startsWith(dist+sep)&&path!==dist){res.writeHead(403);res.end();return;}const file=extname(path)?path:join(dist,'index.html');res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
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
 const desktopHero=await evaluate("({padding:parseFloat(getComputedStyle(document.querySelector('.dashboard-hero')).paddingLeft),radius:parseFloat(getComputedStyle(document.querySelector('.dashboard-hero')).borderRadius),border:getComputedStyle(document.querySelector('.dashboard-hero')).borderTopWidth})");
 assert.ok(desktopHero.padding>=20);assert.ok(desktopHero.radius>=16);assert.equal(desktopHero.border,'0px');
 for(const width of [320,390]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
  const controls=await evaluate("Array.from(document.querySelectorAll('.topbar-menu,.topbar-expense,.stayman-topbar .theme-toggle,.notification-bell,.topbar-avatar,.search-toggle')).map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top}))");
  assert.ok(controls.every(rect=>rect.width===40&&rect.height===40),JSON.stringify(controls));assert.ok(Math.max(...controls.map(r=>r.top))-Math.min(...controls.map(r=>r.top))<2,'Mobile navbar controls must share one baseline');
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.dashboard-night-scene')).opacity"),'1');
  const image=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'mobile-navbar-'+width+'.png'),Buffer.from(image.data,'base64'));
 }
 await evaluate("{const overlay=document.createElement('div');overlay.className='dialog-backdrop fixed inset-0 z-50';overlay.id='qa-dialog';document.body.append(overlay);}");
 const overlay=await evaluate("({top:document.querySelector('#qa-dialog').getBoundingClientRect().top,left:document.querySelector('#qa-dialog').getBoundingClientRect().left,height:document.querySelector('#qa-dialog').getBoundingClientRect().height,viewport:innerHeight,blur:getComputedStyle(document.querySelector('#qa-dialog')).backdropFilter})");
 assert.equal(overlay.top,0);assert.equal(overlay.left,0);assert.equal(overlay.height,overlay.viewport);assert.equal(overlay.blur,'blur(8px)');await evaluate("document.querySelector('#qa-dialog').remove()");
 await call('Emulation.setEmulatedMedia',{media:'print'});
 assert.equal(await evaluate("getComputedStyle(document.body).backgroundColor"),'rgb(255, 255, 255)');
 await call('Emulation.setEmulatedMedia',{media:''});
 await call('Page.navigate',{url:origin+'/phone-picker'});await waitFor("!!document.querySelector('.phone-country-trigger img')");
 assert.equal(await evaluate("document.querySelector('input[name=phone]').value"),'9876543210');
 await evaluate("document.querySelector('.phone-country-trigger').click()");await waitFor("!!document.querySelector('.phone-country-search input')");
 await evaluate("{const input=document.querySelector('.phone-country-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Gambia');input.dispatchEvent(new Event('input',{bubbles:true}));}");
 await waitFor("document.querySelectorAll('[role=option]').length===1");
 await evaluate("document.querySelector('.phone-country-search input').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
 await waitFor("!!document.querySelector('[data-country=GM]')");assert.equal(await evaluate("document.querySelector('input[name=phone]').value"),'');
 assert.equal(await evaluate("document.querySelector('.phone-country-trigger img').complete"),true);
 await evaluate("document.querySelector('.phone-country-trigger').click()");await waitFor("!!document.querySelector('.phone-country-panel')");
 const picker=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(output,'phone-country-picker.png'),Buffer.from(picker.data,'base64'));
 console.log('PASS actual SVG country picker: search, keyboard selection, rendered flag and clearing the old number');
 console.log('PASS toggle persistence, direct routes, dark card/input colours and white print output');console.log('Screenshots: '+output);console.log(JSON.stringify(dark));
}finally{socket?.close();processHandle.kill();await new Promise(done=>server.close(done));}
