"""Local browser QA; all Supabase requests are mocked, no guest data is used."""
import asyncio,json,time,tempfile
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('base',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge');context=await browser.new_context(viewport={'width':390,'height':844})
  session=dict(access_token='synthetic',refresh_token='synthetic',token_type='bearer',expires_at=int(time.time())+86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
  anonymous={**session,'user':{**session['user'],'is_anonymous':True}}
  await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');localStorage.setItem("stayman-guest-checkin",'+json.dumps(json.dumps(anonymous))+');')
  errors=[]
  row=dict(id=base.PROP,kind='member',name='Synthetic Guest',gender='NON_BINARY',phone='+919876543210',email='guest@example.invalid',reservation_id=base.PROP,booking_ref='QA-1',arrival='2026-10-24',departure='2026-10-25',stay='future',web_done=True,rooms=[],total_amount=100000,paid_amount=0)
  calls=[]
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1]
   calls.append(endpoint)
   assert urlparse(req.url).hostname==base.host
   if '/auth/' in path:body=session['user']
   elif endpoint=='stayman_properties':body=[{'id':base.PROP,'name':'QA Property','timezone':'Asia/Kolkata'}]
   elif endpoint=='stayman_guest_directory':body={'rows':[row],'total':1}
   elif endpoint=='stayman_checkin_notifications':body={'count':1,'due':[{'id':base.PROP,'guest_name':'Current arrival','needs_review':True,'has_room':True}],'upcoming':[],'walkins':[],'overdue_count':1,'overdue':[{'id':base.PROP,'guest_name':'Overdue guest','check_out_date':'2026-10-21'}],'missed_count':2,'missed':[{'id':base.PROP,'guest_name':'Missed guest','check_out_date':'2026-10-20'}],'missed_walkins':[{'id':base.PROP,'details':{'full_name':'Past walk-in','departure_date':'2026-10-19'}}]}
   elif endpoint=='stayman_workspace_data':
    body={'units':base.fixture(0)['stayman_units'],'all_units':base.fixture(0)['stayman_units'],'guests':[{'id':base.PROP,'full_name':'Overdue guest','phone':''}],'reservations':[],'allocations':[],'payments':[],'members':[],'operations':{'items':[],'costs':{'incurred':0,'paid':0,'unpaid':0}},'activities':[]}
    if req.post_data_json.get('p_mode')=='reservation':body['reservations']=[{'id':base.PROP,'guest_id':base.PROP,'booking_ref':'QA-OVERDUE','status':'CHECKED_IN','check_in_date':'2026-10-20','check_out_date':'2026-10-21','total_amount':10000,'paid_amount':10000}]
   elif endpoint=='stayman_invoice_context':body={'checkout_status':'CHECKED_OUT','invoice_number':'INV-QA-1','status':'ISSUED','settings':{'registration':'UNCONFIGURED'},'property':{'name':'QA Property'},'guest':{'name':'Synthetic Guest','phone':'','email':''},'bill_to':{},'booking':{'reference':'QA-1','arrival':'2026-10-24','departure':'2026-10-25','nights':1},'lines':[],'payments':[],'taxable':0,'cgst':0,'sgst':0,'igst':0,'adjustment':0,'total':0,'net_paid':0,'balance':0}
   elif endpoint=='guest_property_profile':body={'id':base.PROP,'name':'QA Property'}
   elif endpoint=='start_public_guest_checkin':body={'id':base.PROP,'status':'draft'}
   else:errors.append('Unexpected request '+endpoint);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await context.route('https://**/*',intercept);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.set_viewport_size({'width':1366,'height':900})
   await page.goto('http://127.0.0.1:4173/')
   first=page.get_by_role('article',name='Web check-in tasks',exact=True)
   second=page.get_by_role('article',name='Overdue guests',exact=True)
   await expect(first).to_be_visible();await expect(second).to_be_visible()
   a=await first.bounding_box();b=await second.bounding_box();assert abs(a['y']-b['y'])<2 and b['x']>a['x']
   await expect(second.get_by_text('Overdue guest',exact=True)).to_be_visible()
   await expect(second.get_by_text('Missed guest',exact=True)).to_be_visible()
   await expect(second.get_by_role('link',name='Review submission',exact=True)).to_have_attribute('href','/guests?view=walkin:'+base.PROP)
   assert calls.count('stayman_checkin_notifications')==1,calls
   await second.get_by_role('button',name='Review / check out',exact=True).click()
   await expect(page.get_by_role('dialog',name='Reservation details',exact=True)).to_be_visible()
   await expect(page.get_by_text('Overdue checkout.',exact=True)).to_be_visible()
   await page.get_by_role('button',name='Close modal',exact=True).click()
   await page.set_viewport_size({'width':390,'height':844})
   a=await first.bounding_box();b=await second.bounding_box();assert b['y']>=a['y']+a['height']
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
   await page.screenshot(path=str(Path(tempfile.gettempdir())/'stayman-overdue-dashboard.png'),full_page=True)
   assert not errors,errors
   print('PASS dashboard two cards, missed submissions, shared single notification request, overdue review action, mobile no overflow')
  finally:await browser.close()
asyncio.run(main())
