"""Read-only production browser audit. All Supabase traffic is intercepted locally."""
import asyncio, json, os, re, time
from pathlib import Path
from urllib.parse import urlparse
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
env=dict(re.findall(r'^\s*([A-Z0-9_]+)\s*=\s*["\']?([^\r\n"\']+)',(ROOT/'.env.local').read_text(encoding='utf-8-sig'),re.M))
host=urlparse(env['VITE_SUPABASE_URL']).hostname
ref=host.split('.')[0]
PROP='00000000-0000-0000-0000-000000000001'
stamp='2026-10-01T00:00:00Z'

def fixture(n):
    units=[dict(id=f'u{i}',property_id=PROP,label=f'Bed {i}',room_name=f'Room {i//4}',unit_type='BED',gender_policy='MIXED',nightly_rate_paise=50000) for i in range(40)]
    guests=[dict(id=f'g{i}',property_id=PROP,full_name=f'Synthetic Guest {i}',phone='+919876543210',gender='MALE',nationality='India',created_at=stamp) for i in range(n)]
    reservations=[dict(id=f'r{i}',property_id=PROP,guest_id=f'g{i}',booking_ref=f'QA-{i}',status='CHECKED_OUT',check_in_date='2026-09-01',check_out_date='2026-09-03',total_amount=100000,paid_amount=100000,created_at=stamp) for i in range(n)]
    allocations=[dict(id=f'a{i}',property_id=PROP,reservation_id=f'r{i}',unit_id=f'u{i%40}',check_in_date='2026-09-01',check_out_date='2026-09-03',status='ASSIGNED',charge_paise=100000) for i in range(n)]
    return dict(stayman_units=units,stayman_guests=guests,stayman_reservations=reservations,stayman_allocations=allocations,stayman_properties=[dict(id=PROP,name='QA Synthetic Property',timezone='Asia/Kolkata',currency='INR',check_in_time='14:00',check_out_time='11:00')])

async def run(browser,n,slow=False,observe=False):
    context=await browser.new_context(viewport={'width':1366,'height':768})
    session=dict(access_token='qa-synthetic-token',refresh_token='qa-refresh',token_type='bearer',expires_at=int(time.time())+86400,expires_in=86400,user=dict(id=PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
    await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+ref+'-auth-token')+','+json.dumps(json.dumps(session))+'); window.__long=[]; new PerformanceObserver(l=>window.__long.push(...l.getEntries().map(e=>e.duration))).observe({type:"longtask",buffered:true});')
    data=fixture(n); calls=[]; errors=[]
    async def intercept(route):
        req=route.request
        if urlparse(req.url).hostname!=host:
            await route.abort(); return
        path=urlparse(req.url).path; table=path.split('/')[-1]
        if '/auth/' in path: result=session['user']
        elif '/rpc/' in path:
            result=True if table=='stayman_is_owner' else {'rows':[],'total':0} if table=='stayman_guest_directory' else []
        else:
            result=data.get(table,[])
            query=dict(re.findall(r'([^?&=]+)=([^&]*)',req.url))
            offset=int(query.get('offset','0')); limit=int(query.get('limit','1000'))
            result=result[offset:offset+limit]
        body=json.dumps(result,separators=(',',':'))
        calls.append(dict(t=round(time.perf_counter(),3),endpoint=table,bytes=len(body.encode())))
        if slow: await asyncio.sleep(.4+len(body.encode())/50000)
        await route.fulfill(status=200,content_type='application/json',body=body)
    await context.route('https://**/*',intercept)
    page=await context.new_page(); page.on('pageerror',lambda e:errors.append(str(e)))
    cdp=await context.new_cdp_session(page)
    await cdp.send('Performance.enable')
    if slow:
        await cdp.send('Emulation.setCPUThrottlingRate',{'rate':6})
        await cdp.send('Network.enable')
        await cdp.send('Network.emulateNetworkConditions',dict(offline=False,latency=400,downloadThroughput=50000,uploadThroughput=25000,connectionType='cellular3g'))
    start=time.perf_counter()
    await page.goto('http://127.0.0.1:4173/',wait_until='domcontentloaded',timeout=90000)
    try:
        await page.locator('.room-status-grid').wait_for(timeout=45000)
    except Exception:
        print(json.dumps({'debug':await page.locator('body').inner_text(),'errors':errors,'calls':calls}),flush=True)
        raise
    ready=time.perf_counter()-start
    await page.wait_for_timeout(1000)
    initial=len(calls)
    if observe: await page.wait_for_timeout(62000)
    idle=len(calls)-initial
    before=len(calls)
    await page.get_by_role('button',name='Notifications:',exact=False).click()
    await page.wait_for_timeout(2000 if not slow else 15000)
    bell=len(calls)-before
    await page.get_by_role('button',name='Close notifications',exact=True).click()
    before=len(calls)
    await page.locator('#main-sidebar').get_by_role('link',name='Stay View',exact=True).click()
    await page.locator('.stay-scroll').wait_for(timeout=90000)
    await page.wait_for_timeout(1500 if not slow else 15000)
    nav=len(calls)-before
    metrics={m['name']:m['value'] for m in (await cdp.send('Performance.getMetrics'))['metrics']}
    output=dict(rows_per_history_table=n,slow=slow,dashboard_ready_s=round(ready,2),initial_api_calls=initial,idle_62s_calls=idle if observe else None,bell_calls=bell,stayview_navigation_calls=nav,total_api_calls=len(calls),api_json_bytes=sum(x['bytes'] for x in calls),heap_used_MB=round(metrics['JSHeapUsedSize']/1048576,2),heap_allocated_MB=round(metrics['JSHeapTotalSize']/1048576,2),dom_nodes=metrics['Nodes'],long_tasks=await page.evaluate('({count:__long.length,max_ms:Math.max(0,...__long),total_ms:__long.reduce((a,b)=>a+b,0)})'),errors=errors,endpoints={k:sum(1 for x in calls if x['endpoint']==k) for k in sorted(set(x['endpoint'] for x in calls))})
    await cdp.send('HeapProfiler.collectGarbage')
    output['post_gc_heap_MB']=round((await page.evaluate('performance.memory.usedJSHeapSize'))/1048576,2)
    await context.close()
    return output

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,channel='msedge')
        results=[]
        for n,slow,observe in [(100,False,True),(100,True,False),(5000,False,False),(5000,True,False)]:
            try: result=await run(browser,n,slow,observe)
            except Exception as e: result=dict(rows=n,slow=slow,error=str(e))
            results.append(result)
            (ROOT/'qa/performance-results.json').write_text(json.dumps(results,indent=2))
            print(json.dumps(result),flush=True)
        await browser.close()

if __name__=='__main__': asyncio.run(main())
