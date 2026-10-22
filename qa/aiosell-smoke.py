"""Browser smoke with synthetic Supabase responses; never contacts Aiosell or a real DB."""
import asyncio, json, time
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location, module_from_spec
from playwright.async_api import async_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
spec = spec_from_file_location('base', ROOT / 'qa/performance-audit.py')
base = module_from_spec(spec); spec.loader.exec_module(base)

async def main():
 async with async_playwright() as p:
  browser = await p.chromium.launch(headless=True, channel='msedge')
  context = await browser.new_context(viewport={'width': 1280, 'height': 900})
  session = dict(access_token='synthetic', refresh_token='synthetic', token_type='bearer', expires_at=int(time.time())+86400, user=dict(id=base.PROP, email='qa@example.invalid', aud='authenticated', role='authenticated', is_anonymous=False))
  await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  await context.request.post('http://127.0.0.1:4174/reset', data={'count': 0})
  errors=[]; calls=[]; connection=None; saved=None; local_rates={}; last_saved_rates=[]; price_status='pending'
  async def intercept(route):
   nonlocal connection, saved, last_saved_rates, price_status
   req=route.request; endpoint=urlparse(req.url).path.split('/')[-1]
   assert urlparse(req.url).hostname == base.host
   calls.append(endpoint)
   body={}; status=200
   if endpoint=='stayman_properties':
    response=await context.request.post('http://127.0.0.1:4174/properties'); body=await response.json()
   elif endpoint in ['stayman_workspace_data','stayman_checkin_notifications']:
    response=await context.request.post('http://127.0.0.1:4174/rpc', data={'name':endpoint,'args':req.post_data_json}); body=await response.json()
    if endpoint=='stayman_workspace_data':
     for i,unit in enumerate(body['units']):
      if i<2: unit.update(unit_type='ROOM',room_name='Private Room',label='Room '+str(101+i))
      if unit['id'] in local_rates: unit['nightly_rate_paise']=local_rates[unit['id']]
   elif endpoint=='stayman_aiosell_settings': body={'connection': connection, 'events': [], 'reviewCount':0}
   elif endpoint=='stayman_aiosell_save':
    saved=req.post_data_json
    previous=connection or {}
    connection={**previous,'hotel_code':saved['p_hotel'],'enabled':saved['p_enabled'],'mappings':saved['p_mappings'],'revision':previous.get('revision',0)+1,'synced_revision':previous.get('synced_revision',0)}
    body=None
   elif endpoint=='stayman_save_rates':
    last_saved_rates=req.post_data_json['p_rates']
    local_rates.update({r['unitId']:r['ratePaise'] for r in last_saved_rates}); price_status='pending'; body=None
   elif endpoint=='stayman_aiosell_pricing_status': body={'status':price_status,'enabled':True,'mappings':[]}
   elif endpoint=='aiosell-sync':
    if req.post_data_json['action']=='mapping': body={'hotel_name':'Synthetic sandbox','currency':'INR','timezone':'Asia/Kolkata','rooms':[{'room_id':'suite','room_name':'Suite','rateplans':[{'rateplan_id':'suite-ep','rateplan_name':'Room Only'}]}]}
    else:
     results={'inventory':{'status':'sent','message':'Accepted'},'rates':{'status':'sent','message':'Accepted'},'restrictions':{'status':'pending','message':'No confirmed targets'}}
     row={'date':'2026-10-24','roomCode':'suite','mappedUnits':2,'sent':2,'received':2}
     results['inventory']['details']={'hotelCode':'sandbox-pms','revision':connection['revision'],'rows':[row]}
     results['inventory']['verification']={'status':'matched','checked':1,'mismatches':0}
     connection['last_sync_results']={'stages':results,'revision':connection['revision']}
     price_status='sent'
     body={'status':'partial','message':'Sync partially completed. Review the individual results below.','results':results}
   else: errors.append('Unexpected API '+endpoint); status=400
   await route.fulfill(status=status, content_type='application/json', body=json.dumps(body))
  await context.route('https://**/*',intercept)
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.goto('http://127.0.0.1:4173/settings')
   await page.get_by_role('tab',name='Aiosell',exact=True).wait_for()
   assert not any('aiosell' in c for c in calls)
   await page.get_by_role('tab',name='Aiosell',exact=True).click()
   await expect(page.get_by_role('heading',name='Aiosell channel manager')).to_be_visible()
   await page.get_by_role('button',name='Save connection',exact=True).click()
   await page.get_by_role('button',name='Fetch Aiosell mapping',exact=True).click()
   await expect(page.get_by_text('Synthetic sandbox',exact=False)).to_be_visible()
   await page.get_by_role('button',name='Add room mapping',exact=True).click()
   await page.get_by_label('Aiosell room code',exact=True).fill('suite')
   await page.get_by_label('Aiosell rate-plan code',exact=True).fill('suite-ep')
   await expect(page.get_by_label('Nightly channel price',exact=False)).to_have_count(0)
   await page.get_by_role('checkbox',name='Private Room / Room 101 (ROOM)',exact=True).check()
   await page.get_by_role('checkbox',name='Private Room / Room 102 (ROOM)',exact=True).check()
   sync_switch=page.get_by_role('switch',name='Enable background sync and receive bookings')
   await sync_switch.click()
   await expect(sync_switch).to_have_attribute('aria-checked','true')
   assert await sync_switch.locator('svg').count()==1
   assert await sync_switch.evaluate("node=>getComputedStyle(node).backgroundColor")=='rgb(21, 128, 61)'
   await expect(page.get_by_text('Unsaved change - click Save connection to apply.',exact=True)).to_be_visible()
   await expect(page.get_by_role('button',name='Sync now',exact=True)).to_be_disabled()
   await page.get_by_role('button',name='Save mappings',exact=True).click()
   await expect(page.get_by_role('button',name='Sync now',exact=True)).to_be_enabled()
   assert 'ratePaise' not in saved['p_mappings'][0]
   await page.get_by_role('button',name='Expand Room mapping 1',exact=True).click()
   await expect(page.get_by_role('button',name='Remove mapping',exact=True)).to_be_disabled()
   await expect(page.get_by_label('Aiosell room code',exact=True)).to_have_attribute('readonly','')
   await expect(page.get_by_role('switch',name='Enable background sync and receive bookings')).to_be_disabled()
   await expect(page.get_by_role('switch',name='Stop sell',exact=True)).to_be_enabled()
   await expect(page.get_by_role('button',name='Save mappings',exact=True)).to_be_enabled()
   await page.get_by_role('link',name='Edit in Pricing',exact=True).click()
   await page.get_by_role('heading',name='Pricing',exact=True).wait_for()
   rooms=page.locator('.card').filter(has=page.get_by_role('heading',name='All private rooms',exact=True))
   await rooms.get_by_label('Nightly rate (INR)',exact=True).fill('1200')
   await rooms.get_by_role('button',name='Apply to all',exact=True).click()
   beds=page.locator('.card').filter(has=page.get_by_role('heading',name='All dorm beds',exact=True))
   await beds.get_by_label('Nightly rate (INR)',exact=True).fill('600')
   await beds.get_by_role('button',name='Apply to all',exact=True).click()
   await page.get_by_role('button',name='Save all changes',exact=True).click()
   confirmation=page.get_by_role('dialog',name='Confirm pricing update',exact=True)
   await expect(confirmation).to_be_visible()
   assert not last_saved_rates
   before_cancel=len(calls)
   await confirmation.get_by_role('button',name='Cancel',exact=True).click()
   await expect(confirmation).to_have_count(0)
   assert len(calls)==before_cancel
   await page.get_by_role('button',name='Save all changes',exact=True).click()
   await expect(confirmation).to_be_visible()
   await confirmation.get_by_role('button',name='Confirm and save',exact=True).click()
   await expect(page.get_by_role('status').filter(has_text='Prices saved')).to_contain_text('Prices saved')
   await expect(page.get_by_role('status').filter(has_text='Aiosell rates sent.')).to_be_visible()
   assert calls.count('aiosell-sync')==2  # One mapping fetch, one automatic sync after saving.
   assert sum(r['ratePaise']==120000 for r in last_saved_rates)==2
   assert sum(r['ratePaise']==60000 for r in last_saved_rates)==38
   await page.get_by_label('Pricing view',exact=True).select_option('individual')
   room102=page.get_by_label('Nightly rate for Private Room / Room 102',exact=True)
   await room102.fill('1500')
   await page.get_by_label('Pricing view',exact=True).select_option('grouped')
   await expect(page.get_by_label('Nightly rate for Private Room',exact=True)).to_have_value('')
   await page.get_by_label('Pricing view',exact=True).select_option('individual')
   await expect(room102).to_have_value('1500')
   await expect(page.get_by_label('Nightly rate for Private Room / Room 101',exact=True)).to_have_value('1200')
   await page.get_by_role('button',name='Save all changes',exact=True).click()
   await expect(confirmation).to_contain_text('1500.00')
   await confirmation.get_by_role('button',name='Confirm and save',exact=True).click()
   await expect(page.get_by_role('status').filter(has_text='Prices saved')).to_contain_text('Prices saved')
   await expect(page.get_by_role('status').filter(has_text='Aiosell rates sent.')).to_be_visible()
   assert sum(r['ratePaise']==150000 for r in last_saved_rates)==1
   assert sum(r['ratePaise']==120000 for r in last_saved_rates)==1
   assert sum(r['ratePaise']==60000 for r in last_saved_rates)==38
   await page.reload()
   await page.get_by_label('Pricing view',exact=True).wait_for()
   await expect(page.get_by_label('Nightly rate for Private Room',exact=True)).to_have_value('')
   await page.get_by_role('button',name='Save all changes',exact=True).click()
   await expect(confirmation).to_contain_text('No prices have changed')
   await confirmation.get_by_role('button',name='Confirm and save',exact=True).click()
   await expect(page.get_by_role('status').filter(has_text='Prices saved')).to_contain_text('Prices saved')
   await expect(page.get_by_role('status').filter(has_text='Aiosell rates sent.')).to_be_visible()
   assert sum(r['ratePaise']==150000 for r in last_saved_rates)==1
   assert sum(r['ratePaise']==120000 for r in last_saved_rates)==1
   await page.get_by_label('Pricing view',exact=True).select_option('individual')
   await room102.fill('1200')
   await page.get_by_role('button',name='Save all changes',exact=True).click()
   await confirmation.get_by_role('button',name='Confirm and save',exact=True).click()
   await expect(page.get_by_role('status').filter(has_text='Prices saved')).to_contain_text('Prices saved')
   await expect(page.get_by_role('status').filter(has_text='Aiosell rates sent.')).to_be_visible()
   await page.get_by_role('link',name='Open Aiosell in Settings',exact=True).click()
   await page.get_by_role('tab',name='Aiosell',exact=True).click()
   expand_mapping=page.get_by_role('button',name='Expand Room mapping 1',exact=True)
   await expect(expand_mapping).to_have_attribute('aria-expanded','false')
   await expect(page.get_by_label('Aiosell room code',exact=True)).to_be_hidden()
   await expect(page.locator('.aiosell-mapping .collapsible-card-summary')).to_contain_text('2 rooms selected')
   await page.evaluate("document.documentElement.dataset.theme='light'")
   colors=await page.locator('.aiosell-mapping > .collapsible-card').evaluate("node=>({card:getComputedStyle(node).backgroundColor,parent:getComputedStyle(node.closest('.card')).backgroundColor})")
   assert colors['card']!=colors['parent'],colors
   from tempfile import gettempdir
   await page.locator('.aiosell-mapping').screenshot(path=str(Path(gettempdir())/'stayman-aiosell-light.png'))
   await page.evaluate("document.documentElement.dataset.theme='dark'")
   await page.locator('.aiosell-mapping').screenshot(path=str(Path(gettempdir())/'stayman-aiosell-dark.png'))
   await expand_mapping.click()
   await expect(page.get_by_text('Following Pricing: INR 1200.00 per room / night.',exact=True)).to_be_visible()
   await page.get_by_role('button',name='Collapse Room mapping 1',exact=True).click()
   await expect(page.get_by_label('Aiosell room code',exact=True)).to_be_hidden()
   await page.get_by_role('button',name='Expand Room mapping 1',exact=True).click()
   await expect(page.get_by_label('Aiosell room code',exact=True)).to_have_value('suite')
   await page.get_by_role('button',name='Sync now',exact=True).click()
   notice=page.get_by_role('status',name='Aiosell sync notification')
   await expect(notice).to_be_visible()
   await expect(notice).to_contain_text('Sync partially completed')
   await expect(notice).to_contain_text('Restrictions: Pending')
   await page.get_by_role('button',name='Dismiss sync notification').click()
   await expect(notice).to_have_count(0)
   await expect(page.get_by_text('Inventory: Sent',exact=True)).to_be_visible()
   await expect(page.get_by_text('Rates: Sent',exact=True)).to_be_visible()
   await expect(page.get_by_text('Restrictions: Pending',exact=True)).to_be_visible()
   trace=page.locator('details').filter(has=page.get_by_text('Inventory sent / Aiosell read-back',exact=True))
   await trace.locator('summary').click()
   await expect(trace).to_contain_text('Sampled counts matched')
   await expect(trace.get_by_role('columnheader',name='Aiosell returned',exact=True)).to_be_visible()
   await expect(trace.get_by_role('cell',name='suite',exact=True)).to_be_visible()
   await page.reload()
   await page.get_by_role('tab',name='Aiosell',exact=True).click()
   await expect(page.get_by_text('Restrictions: Pending',exact=True)).to_be_visible()
   await page.set_viewport_size({'width':390,'height':844})
   await expect(page.get_by_label('Hotel code')).to_be_visible()
   await page.get_by_role('button',name='Expand Room mapping 1',exact=True).click()
   stop_switch=page.get_by_role('switch',name='Stop sell',exact=True)
   stop_dialog=page.get_by_role('dialog',name='Confirm stop sell change',exact=True)
   before_stop=len(calls)
   await stop_switch.click()
   await expect(stop_dialog).to_contain_text('Existing reservations are not cancelled or changed')
   await expect(stop_dialog).to_contain_text('draft only')
   await expect(stop_dialog.get_by_role('button',name='Cancel',exact=True)).to_be_focused()
   await stop_dialog.get_by_role('button',name='Cancel',exact=True).click()
   await expect(stop_switch).to_have_attribute('aria-checked','false')
   assert len(calls)==before_stop
   await stop_switch.click()
   await stop_dialog.get_by_role('button',name='Confirm stop sell',exact=True).click()
   await expect(stop_switch).to_have_attribute('aria-checked','true')
   red=await stop_switch.evaluate("node=>getComputedStyle(node).backgroundColor")
   assert red=='rgb(220, 38, 38)',red
   assert len(calls)==before_stop
   await stop_switch.click()
   await expect(stop_dialog).to_contain_text('Reopen category for bookings')
   await stop_dialog.get_by_role('button',name='Cancel',exact=True).click()
   await expect(stop_switch).to_have_attribute('aria-checked','true')
   await page.get_by_role('button',name='Save mappings',exact=True).click()
   enable=page.get_by_role('switch',name='Enable background sync and receive bookings')
   await expect(enable).to_be_disabled()
   await page.get_by_role('button',name='Sync now',exact=True).click()
   await expect(enable).to_be_enabled()
   await page.get_by_role('button',name='Dismiss sync notification').click()
   await enable.click()
   await expect(enable).to_have_attribute('aria-checked','false')
   await expect(page.get_by_role('button',name='Remove mapping',exact=True)).to_be_disabled()
   await page.get_by_role('button',name='Save connection',exact=True).click()
   await expect(page.get_by_role('button',name='Remove mapping',exact=True)).to_be_enabled()
   await expect(page.get_by_label('Aiosell room code',exact=True)).not_to_have_attribute('readonly','')
   assert not errors, errors
   result={'lazy_settings_requests':True,'mapping_fetch':True,'pricing_room_1200_bed_600':True,'individual_room_prices':True,'pricing_view_switch_preserves_edits':True,'grouped_save_preserves_mixed_rates':True,'no_duplicate_price_entry':True,'mapping_follows_pricing':True,'unsaved_sync_disabled':True,'partial_sync_visible':True,'results_persist_on_reload':True,'mobile_panel_visible':True,'errors':errors}
   (ROOT/'qa/aiosell-smoke-results.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
   print(json.dumps(result))
  finally: await context.close();await browser.close()
asyncio.run(main())
