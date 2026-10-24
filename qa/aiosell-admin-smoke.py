"""Mocked administrator preparation and live-owner adapter workflow."""
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
  session=dict(access_token='e30.'+claims+'.test',refresh_token='synthetic',token_type='bearer',expires_at=int(time.time())+86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
  await ctx.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  prop=dict(id=base.PROP,name='Synthetic Property',timezone='Asia/Kolkata',address='QA street',currency='INR',phone='',team=[],check_in_time='14:00',check_out_time='11:00')
  units=[dict(id='unit-bed',property_id=base.PROP,label='Bed 1',room_name='MDR',unit_type='BED',gender_policy='ANY',nightly_rate_paise=60000),dict(id='unit-room',property_id=base.PROP,label='Room 101',room_name='Private Room',unit_type='ROOM',gender_policy='ANY',nightly_rate_paise=200000)]
  remote=dict(hotel_id='synthetic-hotel',hotel_name='Synthetic Property',currency='INR',timezone='Asia/Kolkata',rooms=[dict(room_id='mdr-bed-1',room_name='MDR Bed 1',rateplans=[dict(rateplan_id='bed-plan',occupancy=1)]),dict(room_id='private',room_name='Private Room',max_occ=3,rateplans=[dict(rateplan_id='base-plan',occupancy=2),dict(rateplan_id='extra-plan',occupancy=3)])],connected_channels=[])
  state={'connection':None,'approved':False};calls=[];errors=[]
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1];assert urlparse(req.url).hostname==base.host
   payload=req.post_data_json if req.method=='POST' else {};calls.append((endpoint,payload));body=None
   if '/auth/' in path:body=session['user']
   elif endpoint=='stayman_is_platform_admin':body=True
   elif endpoint=='stayman_admin_console':body=dict(properties=[prop],teamAccountCount=0,attentionCount=1,recent=[])
   elif endpoint=='stayman_admin_mapping_change':body=None
   elif endpoint=='stayman_admin_activity_list':body=[]
   elif endpoint in ['stayman_properties','stayman_admin_properties']:body=[prop]
   elif endpoint=='stayman_room_inventory':body=dict(can_manage=True,units=units)
   elif endpoint=='stayman_billing_profile':body=dict(registration='UNCONFIGURED',catalog={})
   elif endpoint=='stayman_aiosell_settings':body=dict(connection=state['connection'],sites=[],remote=remote if state['connection'] else None,events=[])
   elif endpoint=='stayman_aiosell_configure':state['connection']=dict(hotel_code=payload['p_hotel'],enabled=payload['p_enabled'],mappings=payload['p_mappings'],revision=1)
   elif endpoint=='aiosell-sync':
    if payload['action']=='mapping':body=remote
    else:body=dict(status='complete',message='Accepted by Aiosell.',results={k:dict(status='sent',message='Accepted') for k in ['inventory','rates','restrictions']})
   elif endpoint=='stayman_workspace_data':body=dict(units=units,guests=[],reservations=[],allocations=[],members=[],payments=[],team=[],isOwner=True)
   elif endpoint=='stayman_checkin_notifications':body=dict(revision='qa',count=0,due=[],walkins=[],upcoming=[],overdue=[],missed=[],missed_walkins=[])
   elif endpoint=='stayman_aiosell_owner_state':body=dict(state='CONNECTED' if state['approved'] else 'READY',ready=True,approved=state['approved'],enabled=state['approved'],autoSync=True,pending=False,revision=1,propertyName='Synthetic Property',scope={'from':'2026-10-24','through':'2027-01-21'},rooms=[dict(key='room-key',name='Private Room / Room 101',category='Private Room',price=200000,desiredOpen=True,ackOpen=True if state['approved'] else None,guestPricing=dict(includedGuests=2,maxGuests=3,extraGuestPaise=50000))],excluded=[],sites=[],issues=[])
   elif endpoint=='stayman_aiosell_owner_action':assert payload['p_action']=='approve';state['approved']=True
   else:errors.append('Unexpected '+endpoint);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await ctx.route('https://**/*',intercept);page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  try:
   await page.goto('http://127.0.0.1:4173/godfather/properties/'+base.PROP+'/aiosell')
   await page.get_by_label('Hotel code',exact=True).fill('synthetic-hotel');await page.get_by_role('button',name='Connect & fetch units',exact=True).click()
   await expect(page.get_by_label('Aiosell category for Room 101',exact=True)).to_be_visible()
   assert not any(c[0]=='stayman_aiosell_configure' for c in calls)
   await page.get_by_label('Aiosell category for Room 101',exact=True).select_option('private')
   row=page.locator('.aiosell-match-row').filter(has_text='Room 101');await row.get_by_text('Technical details & guest pricing',exact=False).click()
   await row.get_by_label('Guests included',exact=True).fill('2');await row.get_by_label('Maximum guests',exact=True).fill('3');await row.get_by_label('Extra guest per night (INR)',exact=True).fill('500')
   await row.get_by_label('base-plan: guest count',exact=True).fill('2');await row.get_by_label('extra-plan: guest count',exact=True).fill('3')
   await page.get_by_label('I confirm this property',exact=False).check();await page.get_by_role('button',name='Review setup',exact=True).click();await page.get_by_role('button',name='Save & restart updates',exact=True).click()
   await expect(page.get_by_text('Setup saved for owner review.',exact=True)).to_be_visible();assert not state['connection']['enabled'];assert state['connection']['mappings'][1]['guestPricing']['includedGuests']==2
   await page.goto('http://127.0.0.1:4173/settings');await page.get_by_role('tab',name='Aiosell',exact=True).click()
   await expect(page.get_by_role('heading',name='Review your online rooms',exact=True)).to_be_visible();assert await page.get_by_label('Hotel code',exact=True).count()==0
   await page.get_by_role('button',name='Start selling online',exact=True).click();await page.get_by_role('dialog',name='Start selling online?',exact=True).get_by_role('button',name='Start selling online',exact=True).click()
   await expect(page.get_by_role('heading',name='Aiosell connection',exact=True)).to_be_visible();assert state['approved'];assert not errors,errors
   print('PASS administrator preview/preparation and occupancy setup, read-only owner review, explicit approval and live adapter delivery sequence')
  finally:await browser.close()
asyncio.run(main())
