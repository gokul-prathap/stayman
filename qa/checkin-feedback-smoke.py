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
  session['user'].pop('is_anonymous',None)
  anonymous={**session,'user':{**session['user'],'is_anonymous':True}}
  await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');localStorage.setItem("stayman-guest-checkin",'+json.dumps(json.dumps(anonymous))+');')
  errors=[]
  row=dict(id=base.PROP,kind='member',name='Synthetic Guest',gender='NON_BINARY',phone='+919876543210',email='guest@example.invalid',reservation_id=base.PROP,booking_ref='QA-1',arrival='2026-10-24',departure='2026-10-25',stay='future',web_done=True,rooms=[],total_amount=100000,paid_amount=0)
  state={'completed':False}
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1]
   assert urlparse(req.url).hostname==base.host
   if path.endswith('/logout'):state['completed']=False;body={}
   elif path.endswith('/signup'):body={**anonymous,'user':anonymous['user']}
   elif '/auth/' in path:body=session['user']
   elif endpoint=='stayman_staff':body=[{'property_id':base.PROP}] if state.get('staff',True) else []
   elif endpoint=='stayman_properties':body=[{'id':base.PROP,'name':'QA Property','timezone':'Asia/Kolkata'}]
   elif endpoint=='stayman_guest_directory':body={'rows':[row],'total':1}
   elif endpoint=='stayman_checkin_notifications':body={'count':0,'due':[],'upcoming':[],'walkins':[]}
   elif endpoint=='stayman_invoice_context':body={'checkout_status':'CHECKED_OUT','invoice_number':'INV-QA-1','status':'ISSUED','settings':{'registration':'UNCONFIGURED'},'property':{'name':'QA Property'},'guest':{'name':'Synthetic Guest','phone':'','email':''},'bill_to':{},'booking':{'reference':'QA-1','arrival':'2026-10-24','departure':'2026-10-25','nights':1},'lines':[],'payments':[],'taxable':0,'cgst':0,'sgst':0,'igst':0,'adjustment':0,'total':0,'net_paid':0,'balance':0}
   elif endpoint=='claim_guest_checkin':body={'id':base.PROP,'status':'completed'}
   elif endpoint=='guest_property_profile':body={'id':base.PROP,'name':'QA Property'}
   elif endpoint=='start_public_guest_checkin':body={'id':base.PROP,'status':'completed' if state['completed'] else 'draft'}
   else:errors.append('Unexpected request '+endpoint);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await context.route('https://**/*',intercept);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.goto('http://127.0.0.1:4173/guest-check-in?property='+base.PROP)
   front=page.get_by_label('Choose Aadhaar front',exact=True)
   await expect(front).to_be_visible()
   await front.set_input_files({'name':'invalid.txt','mimeType':'text/plain','buffer':b'invalid file'})
   await expect(page.locator('#photo-error-front')).not_to_be_empty()
   await expect(front).to_have_attribute('aria-invalid','true')
   assert await page.locator('main > div > div > p[role="alert"]').count()==0
   state['completed']=True
   await page.reload()
   await expect(page.get_by_role('heading',name='Check-in completed',exact=True)).to_be_visible()
   assert state['completed'],'staff must explicitly start another guest'
   saved=await page.evaluate('(key)=>localStorage.getItem(key)','sb-'+base.ref+'-auth-token')
   await page.get_by_role('button',name='Add another guest',exact=True).click()
   await expect(page.get_by_role('textbox',name='Full name',exact=True)).to_be_visible()
   assert saved==await page.evaluate('(key)=>localStorage.getItem(key)','sb-'+base.ref+'-auth-token')
   state['staff']=False;state['completed']=True
   await page.reload()
   await expect(page.get_by_role('heading',name='Already completed',exact=True)).to_be_visible()
   await expect(page.get_by_role('button',name='Add another guest',exact=True)).to_have_count(0)
   state['staff']=True
   await page.goto('http://127.0.0.1:4173/guest-check-in?invite='+'a'*64)
   await expect(page.get_by_role('heading',name='Check-in completed',exact=True)).to_be_visible()
   await expect(page.get_by_role('button',name='Add another guest',exact=True)).to_be_visible()
   assert 'invite=' in page.url,'private invitation is not reset automatically'
   await page.get_by_role('button',name='Add another guest',exact=True).click()
   await expect(page.get_by_role('textbox',name='Full name',exact=True)).to_be_visible()
   assert 'invite=' not in page.url and 'property=' in page.url
   await page.goto('http://127.0.0.1:4173/guest-check-in?invite='+'a'*64)
   await expect(page.get_by_role('heading',name='Check-in completed',exact=True)).to_be_visible()
   assert not errors,errors
   print('PASS inline errors, explicit staff Add another guest, no guest restart action, staff session preserved, private invitation not overwritten')
  finally:await browser.close()
asyncio.run(main())
