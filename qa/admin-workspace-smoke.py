"""Local browser checks with synthetic RPC data; all external requests intercepted."""
import asyncio,json,time,base64
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('base',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge');ctx=await browser.new_context(viewport={'width':1366,'height':950})
  claims=base64.urlsafe_b64encode(json.dumps({'sub':base.PROP,'amr':[{'method':'otp'}]}).encode()).decode().rstrip('=')
  session=dict(access_token='e30.'+claims+'.test',refresh_token='synthetic',token_type='bearer',expires_at=int(time.time())+86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated'))
  await ctx.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  properties=[dict(id=base.PROP,name='Alpha property',address='Alpha street',tagline='Hostel',timezone='Asia/Kolkata',phone='',team=[],inventory=dict(beds=2,privateRooms=1),aiosellState='Owner review pending',attention=True,needs=dict(aiosell=True),billingReady=False),dict(id='00000000-0000-0000-0000-000000000002',name='Beta property',address='Beta street',tagline='Hotel',timezone='Asia/Kolkata',team=[],inventory=dict(beds=0,privateRooms=3),aiosellState='Not configured',attention=True,needs=dict(owner=True))]
  units=[dict(id='bed',label='Bed 1',room_name='Dorm',unit_type='BED',gender_policy='ANY',nightly_rate_paise=60000)]
  errors=[];calls=[]
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;name=path.split('/')[-1];payload=req.post_data_json if req.method=='POST' else {};calls.append((name,payload))
   if '/auth/' in path:body=session['user']
   elif name=='stayman_is_platform_admin':body=True
   elif name=='stayman_admin_properties':body=properties
   elif name=='stayman_admin_console':body=dict(properties=properties,teamAccountCount=0,attentionCount=2,recent=[])
   elif name=='stayman_room_inventory':body=dict(can_manage=True,units=units)
   elif name in ['stayman_admin_activity_list','stayman_admin_access','stayman_admin_invoices','stayman_staff_invitations']:body=[]
   elif name=='stayman_aiosell_pricing_status':body=dict(mappings=[],enabled=False)
   elif name=='stayman_billing_profile':body=dict(registration='UNCONFIGURED',catalog={})
   elif name=='stayman_aiosell_settings':body=dict(connection=None,remote=None,sites=[],events=[])
   elif name=='stayman_admin_mapping_change':body=None
   elif name=='stayman_aiosell_owner_state':body=dict(state='UNCONFIGURED',ready=False)
   else:errors.append('Unexpected API '+name);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await ctx.route('https://**/*',intercept);page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:4173/godfather')
  await expect(page.get_by_role('heading',name='Platform overview',exact=True)).to_be_visible()
  await page.get_by_role('navigation',name='Platform administration').get_by_role('link',name='Properties',exact=True).click()
  await page.get_by_placeholder('Name, location or type').fill('Beta')
  await expect(page.locator('tbody tr')).to_have_count(1)
  await page.get_by_placeholder('Name, location or type').fill('')
  await page.get_by_role('button',name='Cards',exact=True).click()
  alpha=page.locator('details').filter(has=page.get_by_role('heading',name='Alpha property',exact=True)).last
  await alpha.locator(':scope > summary').click();await alpha.get_by_role('link',name='Open property',exact=True).click()
  await page.get_by_role('navigation',name='Property workspace').get_by_role('button',name='Property details',exact=True).click()
  await page.get_by_label('Property name',exact=True).fill('Alpha edited')
  page.once('dialog',lambda d:d.dismiss())
  await page.get_by_role('navigation',name='Property workspace').get_by_role('button',name='Pricing',exact=True).click()
  await expect(page.get_by_label('Property name',exact=True)).to_be_visible()
  page.once('dialog',lambda d:d.accept())
  await page.get_by_role('navigation',name='Property workspace').get_by_role('button',name='Pricing',exact=True).click()
  await expect(page.get_by_role('heading',name='Nightly prices',exact=True)).to_be_visible()
  page.once('dialog',lambda d:d.dismiss())
  await page.go_back()
  await expect(page.get_by_role('heading',name='Nightly prices',exact=True)).to_be_visible()
  page.once('dialog',lambda d:d.accept())
  await page.get_by_role('navigation',name='Property workspace').get_by_role('button',name='Property details',exact=True).click()
  await expect(page.get_by_label('Property name',exact=True)).to_have_value('Alpha edited')
  identity=page.locator('details').filter(has=page.get_by_role('heading',name='Property identity & contact',exact=True)).last
  await identity.locator(':scope > summary').click()
  assert await page.evaluate("localStorage.getItem('stayman-admin-section:'+"+json.dumps(base.PROP)+"+':identity')")=='false'
  page.once('dialog',lambda d:d.accept())
  await page.get_by_role('link',name='Back to Properties',exact=True).click()
  await page.get_by_role('link',name='Open property',exact=True).last.click()
  await page.get_by_role('navigation',name='Property workspace').get_by_role('button',name='Aiosell',exact=True).click()
  await expect(page.get_by_label('Hotel code',exact=True)).to_have_value('')
  await page.get_by_role('heading',name='Preview owner page',exact=True).click()
  await expect(page.get_by_role('heading',name="Aiosell isn't set up",exact=True)).to_be_visible()
  for width,theme in [(1366,'light'),(390,'light'),(390,'dark')]:
   await page.set_viewport_size({'width':width,'height':950});await page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),(width,theme)
   await page.screenshot(path=str(ROOT/'qa'/f'admin-workspace-{width}-{theme}.png'),full_page=True)
  # Production component with a network-free adapter: simulate lookup failure and linked-booking guard.
  await page.goto('http://127.0.0.1:4173/preview/admin')
  await page.get_by_label('Setup scenario').select_option('FETCH_FAILED')
  await page.get_by_role('button',name='Connect & fetch units',exact=True).click()
  await expect(page.get_by_role('alert').filter(has_text="Couldn't check setup")).to_be_visible()
  await expect(page.get_by_label('Aiosell category for Bed 1',exact=True)).to_have_value('dorm')
  await page.get_by_label('Setup scenario').select_option('LINKED_BOOKINGS')
  await page.get_by_label('Hotel code',exact=True).fill('replacement')
  await page.get_by_role('button',name='Connect & fetch units',exact=True).click()
  await page.get_by_label('Aiosell category for Bed 1',exact=True).select_option('dorm')
  await page.get_by_label('I confirm this property',exact=False).check()
  await page.get_by_role('button',name='Review setup',exact=True).click()
  page.on('dialog',lambda d:d.accept())
  await page.get_by_role('button',name='Save & restart updates',exact=True).click()
  await expect(page.get_by_role('alert').filter(has_text='linked booking dependencies')).to_be_visible()
  await page.get_by_label('Setup scenario').select_option('CONNECTED')
  await page.get_by_role('heading',name='Preview saved owner page',exact=True).click()
  assert await page.get_by_role('switch').count()>0
  assert all([await switch.is_disabled() for switch in await page.get_by_role('switch').all()])
  await page.get_by_role('button',name='Connect & fetch units',exact=True).click()
  await page.get_by_label('Aiosell category for Bed 1',exact=True).select_option('')
  await page.get_by_label('Delivery',exact=True).select_option('failure')
  await page.get_by_label('I confirm this property',exact=False).check()
  await page.get_by_role('button',name='Review setup',exact=True).click()
  await page.get_by_role('button',name='Save & restart updates',exact=True).click()
  await expect(page.get_by_role('heading',name='Finish saved mapping change',exact=True)).to_be_visible()
  await expect(page.get_by_role('button',name='Finish save & restart updates',exact=True)).to_be_disabled()
  await page.get_by_label('Delivery',exact=True).select_option('success')
  await page.get_by_role('button',name='Retry closure',exact=True).click()
  await page.get_by_label('I verified zero availability',exact=False).check()
  await page.get_by_role('button',name='Finish save & restart updates',exact=True).click()
  await expect(page.get_by_text('Mappings saved. Restart update requested; check individual delivery results below.',exact=True)).to_be_visible()
  await expect(page.get_by_label('Aiosell category for Bed 1',exact=True)).to_have_value('')
  assert not errors,errors
  print('PASS admin navigation/search/cards, dirty-form guard and retained tab drafts, scoped property switch, remembered disclosure, read-only preview, fetch failure and linked-booking block, light/dark/mobile overflow')
  await browser.close()
asyncio.run(main())
