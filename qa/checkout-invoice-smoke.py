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
  registration={'value':'NOT_REGISTERED'}
  state={'checkout_status':'CHECKED_IN','status':'DRAFT','balance':0,'guest_address':'10 Market Road, Kochi, India','members':[{'id':'member-a','name':'Departing','checked_out_at':None},{'id':'member-b','name':'Extended','checked_out_at':None}]}
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1]
   assert urlparse(req.url).hostname==base.host
   if '/auth/' in path:body=session['user']
   elif endpoint=='stayman_properties':body=[{'id':base.PROP,'name':'QA Property','timezone':'Asia/Kolkata'}]
   elif endpoint=='stayman_guest_directory':body={'rows':[row],'total':1}
   elif endpoint=='stayman_checkin_notifications':body={'count':0,'due':[],'upcoming':[],'walkins':[]}
   elif endpoint in ['stayman_invoice_context','stayman_folio_preview']:body={'checkout_status':'CHECKED_OUT','invoice_number':'INV-QA-1','status':'ISSUED','settings':{'registration':'UNCONFIGURED'},'property':{'name':'QA Property'},'guest':{'name':'Synthetic Guest','phone':'','email':''},'bill_to':{},'booking':{'reference':'QA-1','arrival':'2026-10-24','departure':'2026-10-25','nights':1},'lines':[],'payments':[],'taxable':0,'cgst':0,'sgst':0,'igst':0,'adjustment':0,'total':0,'net_paid':0,'balance':0}
   elif endpoint=='stayman_checkout_guests':
    payload=req.post_data_json
    for m in state['members']:
     if m['id'] in payload['p_members']:m['checked_out_at']='2026-10-23T10:00:00Z'
    if all(m['checked_out_at'] for m in state['members']):state['checkout_status']='CHECKED_OUT'
    body=None
   elif endpoint=='stayman_prepare_folio':body='folio-a'
   elif endpoint=='stayman_issue_folio':state['status']='ISSUED';body='INV-QA-1'
   elif endpoint=='guest_property_profile':body={'id':base.PROP,'name':'QA Property'}
   elif endpoint=='start_public_guest_checkin':body={'id':base.PROP,'status':'draft'}
   else:errors.append('Unexpected request '+endpoint);body={}
   if endpoint in ['stayman_invoice_context','stayman_folio_preview']:body.update(state);body['settings']['registration']=registration['value']
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await context.route('https://**/*',intercept);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.add_init_script('window.print=()=>{window.__printCalls=(window.__printCalls||0)+1}')
   await page.goto('http://127.0.0.1:4173/invoice/'+base.PROP+'?download=1')
   await expect(page.get_by_role('dialog')).to_be_visible()
   await expect(page.get_by_label('Billing address',exact=True)).to_have_value('10 Market Road, Kochi, India')
   assert await page.evaluate('window.__printCalls||0')==0
   await page.get_by_label('Departing',exact=True).check()
   await page.get_by_role('button',name='Check out selected guests',exact=True).click()
   await expect(page.get_by_role('dialog')).not_to_be_visible()
   assert state['members'][0]['checked_out_at'] and not state['members'][1]['checked_out_at']
   assert await page.evaluate('window.__printCalls||0')==0
   await page.get_by_role('button',name='Review checkout & invoice',exact=True).click()
   await page.get_by_label('Extended',exact=True).check()
   await page.get_by_role('button',name='Check out & print invoice',exact=True).click()
   await page.wait_for_function('window.__printCalls===1')
   await expect(page.locator('.invoice-paper')).to_be_visible()
   await page.emulate_media(media='print')
   await expect(page.locator('.invoice-paper')).to_be_visible()
   assert await page.locator('.invoice-paper').evaluate('el=>el.getBoundingClientRect().height')>200
   await page.emulate_media(media='screen')
   registration['value']='UNCONFIGURED';state['status']='DRAFT'
   await page.reload()
   await expect(page.get_by_role('button',name='Issue & print invoice',exact=True)).to_be_disabled()
   assert await page.get_by_label('Bill to',exact=True).evaluate('el=>el.getBoundingClientRect().height')>=44
   await page.get_by_role('button',name='Close modal').click()
   await expect(page.get_by_role('heading',name='QA Property ? Invoice',exact=True)).to_be_visible()
   await expect(page.get_by_text('Printing is blocked until property billing setup is complete.',exact=False)).to_be_visible()
   registration['value']='NOT_REGISTERED';state['status']='ISSUED'
   state['balance']=100
   await page.reload()
   await expect(page.get_by_role('dialog')).to_be_visible()
   assert await page.evaluate('window.__printCalls||0')==0
   await expect(page.get_by_role('button',name='Issue & print invoice',exact=True)).to_be_disabled()
   assert not errors,errors
   print('PASS invoice browser: direct URL gated, partial group checkout, extended guest retained, paid checkout prints once, unpaid download blocked')
  finally:await browser.close()
asyncio.run(main())
