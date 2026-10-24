"""Synthetic browser QA. All remote requests are intercepted."""
import asyncio,json,time,tempfile
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('base',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge');ctx=await browser.new_context(viewport={'width':1366,'height':900})
  session=dict(access_token='synthetic',refresh_token='synthetic',token_type='bearer',expires_at=int(time.time())+86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
  await ctx.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  units=[];rooms=[];state={'connection':None};calls=[];errors=[]
  for i,code in enumerate(['mdr-bed-1','mdr-bed-2','mdr-bed-3','mdr-bed-4','mdra-bed-1','mdra-bed-2','mdra-bed-3','mdra-bed-4','private-room','private-room-2']):
   units.append(dict(id='unit-'+str(i),property_id=base.PROP,label=code.replace('-',' '),room_name='',unit_type='BED' if i<8 else 'ROOM',gender_policy='ANY',nightly_rate_paise=60000 if i<8 else 200000))
   rooms.append(dict(room_id=code,room_name=code.replace('-',' ').title(),active=True,rateplans=[dict(rateplan_id=code+'-s-ep',occupancy=1)]+([dict(rateplan_id=code+'-d-ep',occupancy=2)] if i>=8 else [])))
  def plans():
   return [{**m,'ratePaise':60000 if 'bed' in m['roomCode'] else 200000,'ratePlans':[{**p,'ratePaise':p.get('ratePaise') if p.get('rateSource')=='fixed' else 60000 if 'bed' in m['roomCode'] else 200000} for p in m['ratePlans']]} for m in state['connection']['mappings']]
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1];assert urlparse(req.url).hostname==base.host
   payload=req.post_data_json if req.method=='POST' else {};calls.append((endpoint,payload));body=None
   if '/auth/' in path:body=session['user']
   elif endpoint=='stayman_properties':body=[dict(id=base.PROP,name='Synthetic Property',timezone='Asia/Kolkata',currency='INR')]
   elif endpoint=='stayman_workspace_data':body=dict(units=units,guests=[],reservations=[],allocations=[],members=[],payments=[],team=[],isOwner=True)
   elif endpoint=='stayman_checkin_notifications':body=dict(revision='qa',count=0,due=[],walkins=[],upcoming=[],overdue=[],missed=[],missed_walkins=[])
   elif endpoint=='stayman_aiosell_settings':body=dict(connection=state['connection'],events=[],reviewCount=0)
   elif endpoint=='stayman_aiosell_configure':
    previous=state['connection'] or {};assert payload['p_revision']==previous.get('revision')
    state['connection']={**previous,'hotel_code':payload['p_hotel'],'enabled':payload['p_enabled'],'mappings':payload['p_mappings'],'revision':previous.get('revision',0)+1,'synced_revision':previous.get('synced_revision',0)}
   elif endpoint=='aiosell-sync':
    if payload['action']=='mapping':body=dict(hotel_id='synthetic-hotel',hotel_name='Synthetic Property',currency='INR',timezone='Asia/Kolkata',rooms=rooms)
    else:
     result={k:dict(status='sent',message='Accepted') for k in ['inventory','rates','restrictions']};state['connection']['last_sync_results']=dict(revision=state['connection']['revision'],stages=result);state['connection']['synced_revision']=state['connection']['revision'];body=dict(status='complete',message='Inventory, rates and restrictions sent to Aiosell.',results=result)
   elif endpoint=='stayman_aiosell_pricing_status':body=dict(status='sent',enabled=True,revision=state['connection']['revision'],mappings=plans())
   elif endpoint=='stayman_aiosell_plan_prices':
    for entry in payload['p_prices']:
     m=next(m for m in state['connection']['mappings'] if m['roomCode']==entry['roomCode']);plan=next(p for p in m['ratePlans'] if p['rateplanCode']==entry['rateplanCode']);plan.update(entry)
    state['connection']['revision']+=1
   else:errors.append('Unexpected '+endpoint);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await ctx.route('https://**/*',intercept);page=await ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept())
  try:
   await page.goto('http://127.0.0.1:4173/settings');await page.get_by_role('tab',name='Aiosell',exact=True).click()
   await page.get_by_label('Hotel code',exact=True).fill('synthetic-hotel');await page.get_by_role('button',name='Connect & fetch units',exact=True).click()
   await expect(page.locator('.aiosell-match-row')).to_have_count(10)
   assert not any(c[0]=='stayman_aiosell_configure' for c in calls)
   for i,room in enumerate(rooms):assert await page.get_by_label('Stayman unit for '+room['room_id'],exact=True).input_value()=='unit-'+str(i)
   await page.get_by_label('I confirm this property',exact=False).check();await page.get_by_role('button',name='Review activation',exact=True).click();await page.get_by_role('button',name='Save & activate',exact=True).click()
   await expect(page.locator('.aiosell-badge')).to_have_text('Connected');assert len(state['connection']['mappings'])==10;assert len(state['connection']['mappings'][8]['ratePlans'])==2
   await page.get_by_role('button',name='Manage mappings',exact=True).click();await expect(page.get_by_label('Stayman unit for mdr-bed-1',exact=True)).to_be_disabled()
   for theme,width in [('light',1366),('dark',390),('light',390)]:
    await page.set_viewport_size(dict(width=width,height=900));await page.evaluate('(t)=>document.documentElement.setAttribute("data-theme",t)',theme)
    assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    await page.screenshot(path=str(Path(tempfile.gettempdir())/('stayman-aiosell-'+theme+'-'+str(width)+'.png')),full_page=True)
   await page.set_viewport_size(dict(width=1366,height=900));await page.goto('http://127.0.0.1:4173/pricing');await page.get_by_text('Channel rate-plan prices',exact=True).click()
   await page.get_by_label('Price source for private-room-d-ep',exact=True).select_option('fixed');await page.get_by_label('Channel price for private-room-d-ep',exact=True).fill('2500')
   await page.get_by_role('button',name='Review plan prices',exact=True).click();await page.get_by_role('button',name='Save plan prices',exact=True).click()
   await expect(page.get_by_text('Plan prices saved.',exact=False)).to_be_visible();assert state['connection']['mappings'][8]['ratePlans'][1]['ratePaise']==250000
   await page.goto('http://127.0.0.1:4173/settings');await page.get_by_role('tab',name='Aiosell',exact=True).click();await page.get_by_text('Change mappings or pause connection',exact=True).click()
   await page.get_by_role('button',name='Close inventory to change mappings',exact=True).click();await expect(page.get_by_role('button',name='Pause & unlock mappings',exact=True)).to_be_disabled()
   await page.get_by_label('I verified zero availability',exact=False).check();await page.get_by_role('button',name='Pause & unlock mappings',exact=True).click()
   await expect(page.locator('.aiosell-badge')).to_have_text('Paused');assert all(m['stopSell'] for m in state['connection']['mappings']);assert not state['connection']['enabled'];await expect(page.get_by_label('Hotel code',exact=True)).to_be_enabled()
   assert not errors,errors
   print('PASS preview without writes, ten matches, multi-plan activation, active locks, desktop/mobile themes, plan pricing and guided closure/pause')
  finally:await browser.close()
asyncio.run(main())
