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
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1]
   assert urlparse(req.url).hostname==base.host
   if '/auth/' in path:body=session['user']
   elif endpoint=='stayman_properties':body=[{'id':base.PROP,'name':'QA Property','timezone':'Asia/Kolkata'}]
   elif endpoint=='stayman_guest_directory':body={'rows':[row],'total':1}
   elif endpoint=='stayman_checkin_notifications':body={'count':0,'due':[],'upcoming':[],'walkins':[]}
   elif endpoint=='stayman_invoice_context':body={'checkout_status':'CHECKED_OUT','invoice_number':'INV-QA-1','status':'ISSUED','settings':{'registration':'UNCONFIGURED'},'property':{'name':'QA Property'},'guest':{'name':'Synthetic Guest','phone':'','email':''},'bill_to':{},'booking':{'reference':'QA-1','arrival':'2026-10-24','departure':'2026-10-25','nights':1},'lines':[],'payments':[],'taxable':0,'cgst':0,'sgst':0,'igst':0,'adjustment':0,'total':0,'net_paid':0,'balance':0}
   elif endpoint=='guest_property_profile':body={'id':base.PROP,'name':'QA Property'}
   elif endpoint=='start_public_guest_checkin':body={'id':base.PROP,'status':'draft'}
   else:errors.append('Unexpected request '+endpoint);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await context.route('https://**/*',intercept);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.goto('http://127.0.0.1:4173/guests');entry=page.locator('.register-summary-row').first
   await expect(entry).to_be_visible();assert await entry.evaluate('el=>el.getBoundingClientRect().height')<=64
   await expect(page.get_by_role('button',name='View / ID',exact=True)).to_have_count(0)
   await page.get_by_role('button',name='Expand guest Synthetic Guest',exact=True).click()
   expanded=page.locator('.register-expanded')
   await expect(expanded.get_by_role('button',name='View / ID',exact=True)).to_be_visible()
   await expect(expanded.get_by_role('button',name='Print invoice',exact=True)).to_be_visible()
   await expanded.get_by_role('button',name='Download invoice',exact=True).click()
   await expect(page.get_by_role('dialog',name='Download invoice',exact=True)).to_be_visible()
   await expect(page.locator('iframe[title="Invoice print preview"]')).to_be_visible()
   await expect(page).to_have_url('http://127.0.0.1:4173/guests')
   await page.get_by_role('button',name='Close modal',exact=True).click()
   await expect(expanded.get_by_text('Non-binary / another gender',exact=True)).to_be_visible()
   await page.get_by_role('button',name='Collapse guest Synthetic Guest',exact=True).press('Enter')
   await expect(expanded).to_have_count(0)
   for width in [1366,390]:
    await page.set_viewport_size({'width':width,'height':900})
    toggle=page.get_by_role('button',name='Filters',exact=True)
    await expect(toggle).to_have_attribute('aria-expanded','false')
    await expect(page.locator('#guest-extra-filters')).not_to_be_visible()
    await toggle.click();await expect(page.locator('#guest-extra-filters')).to_be_visible()
    assert await toggle.evaluate('el=>el.getBoundingClientRect().height')<=44
    await toggle.click();await expect(page.locator('#guest-extra-filters')).not_to_be_visible()
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
   await page.screenshot(path=str(Path(tempfile.gettempdir())/'stayman-guest-compact.png'),full_page=True)
   await page.goto('http://127.0.0.1:4173/guest-check-in?property='+base.PROP)
   address=page.get_by_role('textbox',name='Home address (optional)',exact=True)
   await expect(address).to_be_visible();await address.fill('10 Market Road, Kochi, India')
   await expect(address).to_have_value('10 Market Road, Kochi, India')
   gender=page.get_by_role('combobox',name='Gender',exact=True);await expect(gender).to_be_visible();assert await gender.input_value()==''
   assert await gender.locator('option').count()==5
   await gender.select_option('PREFER_NOT_TO_SAY');await expect(gender).to_have_value('PREFER_NOT_TO_SAY')
   await gender.select_option('NON_BINARY');await expect(gender).to_have_value('NON_BINARY')
   await page.add_init_script('window.print=()=>{window.__printCalls=(window.__printCalls||0)+1}')
   await page.goto('http://127.0.0.1:4173/invoice/'+base.PROP+'?download=1')
   await page.wait_for_function('window.__printCalls===1')
   await expect(page).to_have_title('Invoice-INV-QA-1')
   await expect(page.get_by_text('Choose Save as PDF',exact=False)).to_be_visible()
   assert not errors,errors
   print(json.dumps({'errors':errors,'compactTableRows':True,'expandableActions':True,'desktopFilterToggle':True,'downloadInvoiceLink':True,'keyboardToggle':True,'mobileNoOverflow':True,'webGenderChoices':True}))
  finally:await browser.close()
asyncio.run(main())
