"""Mocked booking-source UI checks; all external requests are intercepted."""
import asyncio,json,time
from datetime import date,timedelta
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('base',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge');ctx=await browser.new_context(viewport={'width':1366,'height':950})
  session=dict(access_token='qa-synthetic-token',refresh_token='qa-refresh',token_type='bearer',expires_at=int(time.time())+86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated'))
  await ctx.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  fixture=base.fixture(10);start=date.today().isoformat();end=(date.today()+timedelta(days=3)).isoformat()
  sources=['Booking.com','Agoda','Airbnb','Expedia','MakeMyTrip','Goibibo','Hostelworld','Direct Booking','Local Agent',None]
  for index,r in enumerate(fixture['stayman_reservations']):r.update(source=sources[index],status='PENDING',check_in_date=start,check_out_date=end)
  for a in fixture['stayman_allocations']:a.update(check_in_date=start,check_out_date=end)
  data=dict(units=fixture['stayman_units'][:10],guests=fixture['stayman_guests'],reservations=fixture['stayman_reservations'],allocations=fixture['stayman_allocations'],members=[],payments=[],folio_payments=[],team=[],isOwner=True,can_edit_guests=False)
  errors=[]
  async def intercept(route):
   req=route.request;endpoint=urlparse(req.url).path.split('/')[-1]
   if urlparse(req.url).hostname!=base.host:errors.append('Unexpected external request');await route.abort();return
   if '/auth/' in req.url:body=session['user']
   elif endpoint=='stayman_properties':body=fixture['stayman_properties']
   elif endpoint=='stayman_workspace_data':body=data
   elif endpoint=='stayman_checkin_notifications':body=dict(count=0,revision='qa',due=[],walkins=[],upcoming=[],overdue=[],missed=[],missed_walkins=[])
   elif endpoint=='stayman_folio_preview':await route.fulfill(status=400,content_type='application/json',body='{"message":"Synthetic billing fixture unavailable"}');return
   elif endpoint=='stayman_is_owner':body=True
   else:body=[]
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await ctx.route('https://**/*',intercept);page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:4173/stayview')
  await expect(page.locator('.stay-pill')).to_have_count(10)
  await expect(page.locator('.stay-pill').first.get_by_role('img',name='Booking source: Booking.com',exact=True)).to_be_visible()
  await expect(page.locator('.stay-pill').last.get_by_role('img',name='Booking source: Source not recorded',exact=True)).to_be_visible()
  await page.wait_for_function("[...document.querySelectorAll('.stay-pill .booking-source img')].length===7 && [...document.querySelectorAll('.stay-pill .booking-source img')].every(i=>i.complete&&i.naturalWidth>0)")
  await page.locator('.stay-pill').first.click()
  await expect(page.locator('.reservation-source-heading').get_by_role('img',name='Booking source: Booking.com',exact=True)).to_be_visible()
  for width,theme in [(1366,'light'),(390,'dark')]:
   await page.set_viewport_size({'width':width,'height':950});await page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
   await expect(page.locator('.reservation-source-heading .booking-source img')).to_be_visible()
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
  await page.keyboard.press('Escape')
  await page.screenshot(path=str(ROOT/'qa'/'booking-source-mobile.png'),full_page=True)
  # A missing asset still leaves a source label/initials rather than a broken image.
  await ctx.route('**/images/booking-sites/booking.png',lambda route:route.abort())
  await page.reload()
  await expect(page.locator('.stay-pill').first.locator('.booking-source__fallback')).to_have_text('B.')
  assert not errors,errors
  print('PASS seven local provider icons, direct/unknown sources, Stay view and reservation details, mobile/dark layout, missing-icon fallback; no external image requests')
  await browser.close()
asyncio.run(main())
