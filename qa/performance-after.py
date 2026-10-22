"""Production browser comparison backed by actual SQL in a local PGlite fixture."""
import asyncio,json,time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright
from importlib.util import spec_from_file_location,module_from_spec
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('baseline',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)

async def run(browser,n,slow=False,observe=False,extended=False):
 context=await browser.new_context(viewport={'width':1366,'height':768})
 await context.request.post('http://127.0.0.1:4174/reset',data={'count':n})
 if extended:await context.request.post('http://127.0.0.1:4174/seed-active')
 session=dict(access_token='qa-synthetic-token',refresh_token='qa-refresh',token_type='bearer',expires_at=int(time.time())+86400,expires_in=86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
 await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+'); window.__long=[]; new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(e=>e.duration))).observe({type:"longtask",buffered:true});')
 calls=[];errors=[];offline=False;assets=[]
 async def intercept(route):
  req=route.request
  if urlparse(req.url).hostname!=base.host:await route.abort();return
  if offline:await route.abort('internetdisconnected');return
  endpoint=urlparse(req.url).path.split('/')[-1]
  if endpoint=='stayman_properties':response=await context.request.post('http://127.0.0.1:4174/properties');body=await response.text()
  elif endpoint in ['stayman_workspace_data','stayman_checkin_notifications','stayman_operations_data']:
   response=await context.request.post('http://127.0.0.1:4174/rpc',data={'name':endpoint,'args':req.post_data_json})
   body=await response.text()
  elif endpoint=='stayman_folio_preview':
   await route.fulfill(status=400,content_type='application/json',body='{"message":"Synthetic fixture: billing intentionally unavailable"}');return
  else:
   errors.append('Unexpected API: '+endpoint);await route.abort();return
  if response.status!=200:errors.append(body)
  calls.append(dict(endpoint=endpoint,bytes=len(body.encode()),args=req.post_data_json if req.method=='POST' else None))
  if slow:await asyncio.sleep(.4+len(body.encode())/50000)
  await route.fulfill(status=response.status,content_type='application/json',body=body)
 await context.route('https://**/*',intercept)
 page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('request',lambda req:assets.append(req.url) if '/assets/' in req.url else None)
 cdp=await context.new_cdp_session(page);await cdp.send('Performance.enable')
 if slow:
  await cdp.send('Emulation.setCPUThrottlingRate',{'rate':6});await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions',dict(offline=False,latency=400,downloadThroughput=50000,uploadThroughput=25000,connectionType='cellular3g'))
 start=time.perf_counter();await page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded',timeout=90000)
 await page.locator('.room-status-grid').wait_for(timeout=90000);ready=time.perf_counter()-start
 await page.wait_for_timeout(1000);initial=len(calls);initial_bytes=sum(c['bytes'] for c in calls)
 initial_phone=any('PhoneInput-' in url for url in assets)
 if observe:await page.wait_for_timeout(62000)
 idle=len(calls)-initial;before=len(calls)
 await page.get_by_role('button',name='Notifications:',exact=False).click();await page.wait_for_timeout(1000)
 bell=len(calls)-before;await page.get_by_role('button',name='Close notifications',exact=True).click()
 await page.locator('#main-sidebar').evaluate("node=>node.dataset.qaIdentity='preserved'")
 await page.evaluate("window.__routeFlashes=[];window.__routeObserver=new MutationObserver(()=>{if(location.pathname!=='/'){const root=[...document.querySelectorAll('.app-loader-full')].some(n=>n.getClientRects().length);const dashboard=document.querySelector('.dashboard');if(root||(dashboard&&dashboard.getClientRects().length))__routeFlashes.push({root,dashboard:!!dashboard});}});__routeObserver.observe(document.body,{childList:true,subtree:true,attributes:true});")
 before=len(calls);await page.locator('#main-sidebar').get_by_role('link',name='Stay View',exact=True).click()
 await page.locator('.stay-scroll').wait_for(timeout=90000);await page.wait_for_timeout(1000)
 nav=len(calls)-before
 preserved=await page.locator('#main-sidebar').get_attribute('data-qa-identity')=='preserved'
 flashes=await page.evaluate('__routeObserver.disconnect(); __routeFlashes')
 before=len(calls);await page.locator('#main-sidebar').get_by_role('link',name='Dashboard',exact=True).click();await page.locator('.room-status-grid').wait_for();await page.wait_for_timeout(600)
 cached_calls=len(calls)-before
 offline=True;await context.set_offline(True)
 await page.locator('#main-sidebar').get_by_role('link',name='Stay View',exact=True).click();await page.locator('.stay-scroll').wait_for()
 offline_visible=await page.locator('#main-sidebar').is_visible() and await page.locator('.stay-scroll').is_visible()
 await context.set_offline(False);offline=False;await page.wait_for_timeout(1000)
 metrics={m['name']:m['value'] for m in (await cdp.send('Performance.getMetrics'))['metrics']}
 output=dict(rows_per_history_table=n,slow=slow,dashboard_ready_s=round(ready,2),initial_api_calls=initial,initial_api_json_bytes=initial_bytes,phone_chunk_loaded_on_dashboard=initial_phone,idle_62s_calls=idle if observe else None,bell_calls=bell,stayview_navigation_calls=nav,cached_dashboard_navigation_calls=cached_calls,navigation_preserved=preserved,route_flashes=flashes,offline_cached_stayview_visible=offline_visible,heap_used_MB=round(metrics['JSHeapUsedSize']/1048576,2),heap_allocated_MB=round(metrics['JSHeapTotalSize']/1048576,2),dom_nodes=metrics['Nodes'],long_tasks=await page.evaluate('({count:__long.length,max_ms:Math.max(0,...__long),total_ms:__long.reduce((a,b)=>a+b,0)})'),errors=errors,endpoints={k:sum(1 for c in calls if c['endpoint']==k) for k in sorted(set(c['endpoint'] for c in calls))})
 await cdp.send('HeapProfiler.collectGarbage');output['post_gc_heap_MB']=round((await page.evaluate('performance.memory.usedJSHeapSize'))/1048576,2)
 if extended:
  checks={}
  await page.locator('#main-sidebar').get_by_role('link',name='Reservations',exact=True).click()
  await page.locator('tbody tr').first.wait_for();assert await page.locator('tbody tr').count()==25
  checks['reservation_page_size']=25
  await page.get_by_role('button',name='Next',exact=True).click();await page.get_by_text('Page 2 of 4',exact=False).wait_for()
  search=page.get_by_role('searchbox',name='Search guests or reservations');await search.fill('QA-99')
  await page.get_by_text('Synthetic Guest 99',exact=True).wait_for();assert await page.locator('tbody tr').count()==1
  checks['server_search_and_pagination']=True
  await page.get_by_role('button',name='View / pay',exact=True).click()
  await page.get_by_role('heading',name='Synthetic Guest 99',exact=True).wait_for()
  assert not any(c['endpoint']=='stayman_folio_preview' for c in calls)
  checks['historical_detail_and_lazy_billing']=True
  await page.get_by_role('button',name='Close modal',exact=True).click()
  await search.fill('QA-0');await page.get_by_text('Synthetic Guest 0',exact=True).wait_for()
  await page.get_by_role('button',name='View / pay',exact=True).click();await page.get_by_role('button',name='Extend stay',exact=True).click()
  await page.locator('.extend-stay-form').wait_for();await page.wait_for_function("!document.querySelector('.extend-stay-form button.primary').disabled")
  checks['extension_availability_query']=any(c['args'] and c['args'].get('p_mode')=='availability' for c in calls)
  await page.locator('.extend-stay-form').get_by_role('button',name='Cancel',exact=True).click()
  await page.get_by_role('button',name='Close modal',exact=True).click()
  await page.get_by_role('button',name='New reservation',exact=True).click();await page.get_by_role('dialog',name='Create Reservation / Walk-In').wait_for()
  await page.get_by_label('Arrival date',exact=True).fill('2026-11-10');await page.get_by_label('Departure date',exact=True).fill('2026-11-12')
  await page.wait_for_timeout(500)
  checks['booking_dates_scope']=any(c['args'] and c['args'].get('p_mode')=='booking' and c['args'].get('p_from')=='2026-11-10' and c['args'].get('p_to')=='2026-11-12' for c in calls)
  assert checks['booking_dates_scope'];await page.get_by_role('button',name='Close modal',exact=True).click()
  await page.locator('#main-sidebar').get_by_role('link',name='Expenses',exact=True).click()
  await page.get_by_role('heading',name='Expenses & Bills',exact=True).wait_for();await page.get_by_text('Page 1 of 1',exact=False).wait_for()
  checks['expenses_paged_rpc']=any(c['endpoint']=='stayman_operations_data' for c in calls)
  await page.locator('#main-sidebar').get_by_role('link',name='Reports',exact=True).click();await page.get_by_role('tab',name='Refunds',exact=True).click()
  await page.get_by_role('heading',name='Refund management',exact=True).wait_for();checks['refund_report_scoped']=True
  await page.goto('http://127.0.0.1:4173/stayview',wait_until='domcontentloaded');await page.locator('.stay-scroll').wait_for()
  assert await page.locator('.dashboard').count()==0;checks['cold_deep_link_no_dashboard']=True
  await page.locator('#main-sidebar').evaluate("node=>node.dataset.qaIdentity='session-stable'")
  before_properties=sum(c['endpoint']=='stayman_properties' for c in calls)
  await page.evaluate("""key=>{const old=localStorage.getItem(key),next=JSON.parse(old);next.access_token='qa-rotated-token';const value=JSON.stringify(next);localStorage.setItem(key,value);window.dispatchEvent(new StorageEvent('storage',{key,oldValue:old,newValue:value,storageArea:localStorage}));}""",'sb-'+base.ref+'-auth-token')
  await page.wait_for_timeout(300)
  assert await page.locator('#main-sidebar').get_attribute('data-qa-identity')=='session-stable'
  assert sum(c['endpoint']=='stayman_properties' for c in calls)==before_properties
  checks['same_user_session_change_keeps_workspace']=True
  await page.clock.install();await page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
  await page.wait_for_timeout(100);before=len(calls);await page.clock.fast_forward(61000);await page.wait_for_timeout(200)
  assert len(calls)==before;checks['hidden_polling_paused']=True
  await page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))")
  offline=True;await context.set_offline(True);await page.wait_for_timeout(100);before=len(calls);await page.clock.fast_forward(61000);await page.wait_for_timeout(200)
  assert len(calls)==before;checks['offline_polling_paused']=True
  output['interaction_checks']=checks;output['errors']=errors
 await context.close();return output

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge');results=[]
  for n,slow,observe in [(100,False,True),(100,True,False),(5000,False,False),(5000,True,False)]:
   try:result=await run(browser,n,slow,observe)
   except Exception as e:result={'rows':n,'slow':slow,'error':str(e)}
   results.append(result);(ROOT/'qa/performance-after-results.json').write_text(json.dumps(results,indent=2));print(json.dumps(result),flush=True)
  await browser.close()
if __name__=='__main__':asyncio.run(main())
