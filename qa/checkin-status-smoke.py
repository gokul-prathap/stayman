"""Checks the reported completed-invitation/null-guest-id case using synthetic SQL data."""
import asyncio,json,time
from pathlib import Path
from urllib.parse import urlparse
from importlib.util import spec_from_file_location,module_from_spec
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
spec=spec_from_file_location('audit',ROOT/'qa/performance-audit.py');base=module_from_spec(spec);spec.loader.exec_module(base)

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True,channel='msedge')
  context=await browser.new_context(viewport={'width':1366,'height':900})
  await context.request.post('http://127.0.0.1:4174/reset',data={'count':100})
  response=await context.request.post('http://127.0.0.1:4174/seed-checkin',data={'completed':False});assert response.ok,await response.text()
  session=dict(access_token='qa-synthetic-token',refresh_token='qa-refresh',token_type='bearer',expires_at=int(time.time())+86400,expires_in=86400,user=dict(id=base.PROP,email='qa@example.invalid',aud='authenticated',role='authenticated',is_anonymous=False))
  await context.add_init_script('localStorage.setItem('+json.dumps('sb-'+base.ref+'-auth-token')+','+json.dumps(json.dumps(session))+');')
  calls=[];errors=[]
  async def intercept(route):
   request=route.request;endpoint=urlparse(request.url).path.split('/')[-1]
   if urlparse(request.url).hostname!=base.host:await route.abort();return
   calls.append(endpoint)
   if endpoint=='stayman_properties':response=await context.request.post('http://127.0.0.1:4174/properties')
   elif endpoint in ['stayman_workspace_data','stayman_checkin_notifications','stayman_operations_data']:
    response=await context.request.post('http://127.0.0.1:4174/rpc',data={'name':endpoint,'args':request.post_data_json})
   elif endpoint=='stayman_bind_member':response=await context.request.post('http://127.0.0.1:4174/bind-contact',data=request.post_data_json)
   else:errors.append('Unexpected API: '+endpoint);await route.abort();return
   body=await response.text()
   if not response.ok:errors.append(body)
   await route.fulfill(status=response.status,content_type='application/json',body=body)
  await context.route('https://**/*',intercept)
  page=await context.new_page();page.on('pageerror',lambda error:errors.append(str(error)))
  try:
   await page.goto('http://127.0.0.1:4173/reservations',wait_until='domcontentloaded')
   await page.get_by_role('searchbox',name='Search guests or reservations').fill('QA-0')
   await page.get_by_text('Synthetic Guest 0',exact=True).wait_for()
   await page.get_by_role('button',name='View / pay',exact=True).click()
   await page.get_by_role('heading',name='Synthetic Guest 0',exact=True).wait_for()
   group=page.locator('.collapsible-card').filter(has=page.get_by_role('heading',name='Group web check-in',exact=True))
   await expect(group.get_by_role('button',name='Expand Group web check-in')).to_be_enabled()
   await group.get_by_role('button',name='Expand Group web check-in').click()
   await expect(group.get_by_text('Web check-in not done',exact=True)).to_be_visible()
   response=await context.request.post('http://127.0.0.1:4174/seed-checkin',data={'completed':True});assert response.ok,await response.text()
   await page.evaluate("document.dispatchEvent(new Event('visibilitychange',{bubbles:true}))")
   await expect(group.get_by_text('1/1 submitted · Completed and linked',exact=True)).to_be_visible()
   toggle=group.get_by_role('button',name='Expand Group web check-in')
   await expect(toggle).to_be_disabled();await expect(toggle).to_have_attribute('aria-expanded','false')
   await expect(group.locator('.collapsible-card-content')).to_be_hidden()
   await expect(page.get_by_role('button',name='Expand Guest web check-in link & QR',exact=True)).to_be_disabled()
   await expect(page.get_by_text('Completed web check-in is linked to this booking.',exact=True)).to_be_visible()
   await expect(page.locator('tbody tr').first.get_by_text('1/1 submitted',exact=True)).to_be_visible()
   assert calls.count('stayman_bind_member')==0
   await page.get_by_role('button',name='View submitted guest details & IDs',exact=True).click()
   await expect(page.get_by_text('Web check-in done',exact=True).first).to_be_visible()
   await expect(page.get_by_role('button',name='Click to load ID',exact=False).first).to_be_visible()
   await page.get_by_role('button',name='Use this submission as booking contact',exact=True).click()
   await expect(page.get_by_text('Booking contact: Web check-in done · ID submitted',exact=True)).to_be_visible()
   assert calls.count('stayman_bind_member')==1
   assert not any(name in calls for name in ['stayman_reissue_member','stayman_add_member','stayman_attach_walkin'])
   await expect(toggle).to_be_disabled()
   assert not errors,errors
   result={'draft_visible_before_completion':True,'completion_with_null_guest_id_shows_done':True,'open_group_collapses_on_completion':True,'completed_cards_disabled':True,'document_review_available':True,'contact_binding_requires_explicit_action':True,'no_duplicate_link_or_guest_created':True,'javascript_errors':errors}
   (ROOT/'qa/checkin-status-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result),flush=True)
  finally:await context.close();await browser.close()

asyncio.run(main())
