"""Expense browser QA against local SQL. All external requests are intercepted."""
import asyncio,json,time,tempfile
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('base',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge')
  context=await browser.new_context(viewport={'width':1366,'height':1000},accept_downloads=True)
  session=dict(access_token='synthetic',refresh_token='synthetic',token_type='bearer',expires_at=int(time.time())+86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
  await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  await context.request.post('http://127.0.0.1:4175/reset')
  errors=[];calls=[]
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1];status=200
   assert urlparse(req.url).hostname==base.host
   calls.append(endpoint)
   if '/auth/' in path: body=session['user']
   elif endpoint=='stayman_properties':
    response=await context.request.post('http://127.0.0.1:4175/properties');body=await response.json()
   elif '/rpc/' in path:
    response=await context.request.post('http://127.0.0.1:4175/rpc',data={'name':endpoint,'args':req.post_data_json});body=await response.json();status=response.status
   elif '/storage/v1/object/sign/' in path: body={'signedURL':'/object/sign/expense-receipts/synthetic?token=synthetic'}
   elif '/storage/' in path:
    await context.request.post('http://127.0.0.1:4175/receipt',data={'path':path.split('/expense-receipts/')[-1]});body={'Key':'synthetic'}
   else:errors.append('Unexpected request '+path);body={};status=400
   await route.fulfill(status=status,content_type='application/json',body=json.dumps(body))
  await context.route('https://**/*',intercept)
  page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  cdp=await context.new_cdp_session(page);await cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
  try:
   await page.goto('http://127.0.0.1:4173/expenses');await expect(page.get_by_role('heading',name='Expenses & Bills',exact=True)).to_be_visible()
   await expect(page.get_by_text('Page 1 of 2',exact=False)).to_be_visible()
   await page.get_by_role('button',name='+ Add expense',exact=True).click()
   await page.get_by_label('How much?').fill('850')
   await page.get_by_role('button',name='Laundry',exact=True).click()
   await page.get_by_role('button',name='Paid',exact=True).click()
   await page.get_by_role('button',name='Save expense',exact=True).click()
   await expect(page.get_by_role('status').filter(has_text='saved')).to_be_visible()
   laundry=page.locator('.expense-history-row').filter(has=page.locator('.expense-row-label',has_text='Laundry')).first
   await laundry.locator(':scope > summary').click()
   await expect(laundry.get_by_text('Paid',exact=True)).to_be_visible()
   await laundry.get_by_role('button',name='History',exact=True).click()
   await expect(page.get_by_role('dialog').get_by_text('Payment · UPI',exact=True)).to_be_visible()
   await page.get_by_role('dialog').get_by_role('button',name='Close dialog').click()
   # A duplicate needs an explicit decision. Cancel sends no second save.
   await page.get_by_role('button',name='+ Add expense',exact=True).click()
   await page.get_by_label('How much?').fill('850');await page.get_by_role('button',name='Laundry',exact=True).click();await page.get_by_role('button',name='Paid',exact=True).click();await page.get_by_role('button',name='Save expense',exact=True).click()
   await expect(page.get_by_role('dialog').get_by_role('heading',name='Possible duplicate expense')).to_be_visible()
   await page.get_by_role('button',name='Go back and check').click();await page.get_by_role('button',name='Cancel',exact=True).click()
   # Partial bill, measurements and payment history.
   await page.get_by_role('button',name='+ Add expense',exact=True).click();await page.get_by_label('How much?').fill('5000');await page.get_by_role('button',name='Electricity',exact=True).click();await page.get_by_role('button',name='Partly paid',exact=True).click();await page.get_by_label('Amount paid now').fill('2000')
   await page.get_by_text('More details · supplier, receipt and bill measurements',exact=True).click();await page.get_by_label('Electricity units').fill('500')
   await page.get_by_label('Receipt photo or PDF').set_input_files({'name':'receipt.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4 synthetic'})
   await page.get_by_role('button',name='Save expense',exact=True).click();await expect(page.get_by_role('status').filter(has_text='saved')).to_be_visible()
   electric=page.locator('.expense-history-row').filter(has=page.locator('.expense-row-label',has_text='Electricity')).first
   await electric.locator(':scope > summary').click();await expect(electric.get_by_text('Unpaid',exact=False)).to_be_visible();await electric.get_by_role('button',name='Record payment',exact=True).click()
   await page.get_by_role('dialog').get_by_role('button',name='Confirm',exact=True).click();await expect(page.get_by_role('status')).to_have_text('Payment history updated.')
   await expect(electric.get_by_text('Paid',exact=True)).to_be_visible()
   await electric.get_by_role('button',name='Supplier refund',exact=True).click();await page.get_by_role('dialog').get_by_label('Amount (₹)',exact=True).fill('500');await page.get_by_role('dialog').get_by_role('button',name='Confirm',exact=True).click();await expect(page.get_by_role('dialog')).to_have_count(0)
   await expect(electric.get_by_text('Refunded',exact=False)).to_be_visible()
   async with page.expect_download() as event:await page.get_by_role('button',name='Download expenses CSV',exact=True).click()
   download=await event.value;csv=Path(await download.path()).read_text(encoding='utf-8-sig');assert 'Synthetic supply 30' in csv and 'Electricity' in csv
   await page.get_by_role('link',name='Income & Expenses report',exact=True).click();await expect(page.get_by_role('heading',name='Electricity comparison')).to_be_visible()
   await expect(page.get_by_text('Operating result',exact=True)).to_be_visible();await expect(page.get_by_role('heading',name='Where money went')).to_be_visible()
   async with page.expect_download() as event:await page.get_by_role('button',name='Download report CSV',exact=True).click()
   download=await event.value;report=Path(await download.path()).read_text(encoding='utf-8-sig');assert 'Operating result' in report and 'kWh' in report and 'Laundry' in report
   await page.get_by_role('button',name='Quick add expense',exact=True).click()
   quick=page.get_by_role('dialog').filter(has=page.get_by_role('heading',name='Quick expense',exact=True))
   await quick.get_by_label('How much?').fill('250');await quick.get_by_role('button',name='Cleaning',exact=True).click();await quick.get_by_role('button',name='Pay later',exact=True).click();await quick.get_by_role('button',name='Save expense',exact=True).click();await expect(quick).to_have_count(0)
   assert page.url.endswith('/reports')
   # Inspect both themes and narrow layout; print remains an explicit user action.
   await page.screenshot(path=str(Path(tempfile.gettempdir())/'stayman-expenses-light.png'),full_page=True)
   await page.get_by_role('heading',name='Electricity comparison').scroll_into_view_if_needed();await page.screenshot(path=str(Path(tempfile.gettempdir())/'stayman-expense-comparisons.png'),full_page=True)
   await page.evaluate("document.documentElement.dataset.theme='dark'");await page.screenshot(path=str(Path(tempfile.gettempdir())/'stayman-expenses-dark.png'),full_page=True)
   await page.set_viewport_size({'width':390,'height':844});assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
   await page.emulate_media(media='print');await page.evaluate("document.body.classList.add('printing-finance')")
   assert await page.locator('#income-expenses-report').evaluate('el=>el.scrollHeight>1000')
   pdf=await page.pdf(path=str(Path(tempfile.gettempdir())/'stayman-expense-report.pdf'),print_background=True);assert pdf.count(b'/Type /Page')>=2
   await page.emulate_media(media='screen');await page.evaluate("document.body.classList.remove('printing-finance');document.documentElement.dataset.theme='light'")
   await page.goto('http://127.0.0.1:4173/expenses');await expect(page.locator('.expense-mobile-entry').first).to_be_visible()
   assert not await page.locator('.expense-filters').evaluate('el=>el.open')
   assert not await page.locator('.expense-desktop-history').is_visible()
   assert await page.locator('.expense-mobile-entry').first.evaluate('el=>el.getBoundingClientRect().height')<220
   assert await page.locator('.finance-metrics').evaluate('el=>getComputedStyle(el).gridTemplateColumns.split(" ").length')==2
   assert await page.locator('.finance-metrics .card').first.evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(228, 235, 245)'
   await expect(page.locator('#main-sidebar')).to_have_attribute('inert','')
   await page.wait_for_timeout(250)
   await page.screenshot(path=str(Path(tempfile.gettempdir())/'stayman-expenses-mobile-compact.png'),full_page=True)
   assert not errors,errors
   result={'browserErrors':errors,'allPagesExported':True,'reportDownloaded':True,'partialPayments':True,'supplierRefund':True,'duplicateWarning':True,'receiptUploadMocked':True,'mobileNoOverflow':True,'quickAddFromReport':True,'cpuSlowdown':4,'calls':len(calls)}
   (ROOT/'qa/expense-smoke-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
  finally:await browser.close()
asyncio.run(main())
