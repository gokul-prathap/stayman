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
  calls=[];mutations=[]
  guest_id=base.PROP;pending_id='11111111-1111-4111-8111-111111111111';overdue_id='22222222-2222-4222-8222-222222222222'
  state={'name':'QA Guest','version':0,'closed':False,'policyVersion':1}
  fields={'full_name':'QA Guest','phone':'+919876543210','email':'qa@example.invalid','gender':'MALE','nationality':'India','address':'10 Market Road, Kochi'}
  policy={'name':'QA policy','free_hours':24,'cancellation':{'type':'FIXED','value':10000},'no_show':{'type':'FIXED','value':20000}}
  def reservation(rid):return {'id':rid,'property_id':base.PROP,'guest_id':guest_id,'booking_ref':'QA-BOOKING','status':'CANCELLED' if state['closed'] and rid==pending_id else 'CHECKED_IN' if rid==overdue_id else 'PENDING','check_in_date':'2026-10-18','check_out_date':'2026-10-20','total_amount':100000,'paid_amount':30000,'closure_kind':'NO_SHOW' if state['closed'] and rid==pending_id else None,'closure_fee':20000 if state['closed'] and rid==pending_id else 0,'closure_money_handler':'PROPERTY','policy_snapshot':{'policy':policy,'version':1}}
  def guest():return {'id':guest_id,'full_name':state['name'],'phone':fields['phone'],'email':fields['email'],'gender':fields['gender'],'nationality':'India'}
  def personal():return {'fields':fields,'version':state['version'],'can_edit':True,'edited_by':'QA Owner' if state['version'] else None,'edited_at':'2026-10-24T10:00:00Z' if state['version'] else None}
  async def intercept(route):
   req=route.request;path=urlparse(req.url).path;endpoint=path.split('/')[-1]
   assert urlparse(req.url).hostname==base.host
   payload=req.post_data_json if req.method=='POST' else {}
   calls.append(endpoint)
   if '/auth/' in path:body=session['user']
   elif endpoint=='stayman_properties':body=[{'id':base.PROP,'name':'QA Property','timezone':'Asia/Kolkata','check_in_time':'14:00','check_out_time':'11:00'}]
   elif endpoint=='stayman_workspace_data':
    body={'units':base.fixture(0)['stayman_units'],'guests':[guest()],'reservations':[reservation(payload['p_reservation'])] if payload.get('p_mode')=='reservation' else [],'allocations':[],'members':[],'payments':[],'activities':[],'team':[{'user_id':base.PROP,'email':'qa@example.invalid','role':'OWNER'}],'can_edit_guests':True,'closureFees':[],'operations':{'items':[],'costs':{'incurred':0,'paid':0,'unpaid':0}}}
   elif endpoint=='stayman_checkin_notifications':body={'revision':'test','count':1,'due':[{'id':pending_id,'guest_name':state['name'],'needs_review':True,'has_room':True}],'walkins':[],'upcoming':[],'overdue_count':50,'overdue':[{'id':overdue_id if i==0 else str(i),'guest_name':'Very long overdue guest name '+str(i),'check_out_date':'2026-10-20'} for i in range(50)],'missed_count':1,'missed':[{'id':pending_id,'guest_name':state['name'],'check_out_date':'2026-10-20'}],'missed_walkins':[]}
   elif endpoint=='stayman_booking_policy':body={'can_edit':True,'version':state['policyVersion'],'policy':policy}
   elif endpoint=='stayman_save_booking_policy':
    mutations.append((endpoint,payload));state['policyVersion']+=1;policy.update(payload['p_policy']);body=None
   elif endpoint=='stayman_guest_directory':body={'rows':[{'id':guest_id,'kind':'guest','name':state['name'],'gender':'MALE','reservation_id':pending_id,'stay':'past','booking_status':'PENDING','total_amount':100000,'paid_amount':30000,'rooms':[]}],'total':1}
   elif endpoint=='stayman_guest_profile':body={'guests':[guest()],'reservations':[reservation(pending_id)],'members':[],'walkins':[],'personal':personal(),'correction_history':[]}
   elif endpoint=='stayman_save_guest_correction':
    mutations.append((endpoint,payload));fields.update(payload['p_fields']);state['name']=fields['full_name'];state['version']+=1;body=None
   elif endpoint=='stayman_closure_quote':body={'reservation_id':pending_id,'status':'PENDING','kind':payload['p_kind'],'total':100000,'received':30000,'notice':payload['p_notice'],'policy':{'policy':policy,'version':1},'fee':20000,'current_fee':0,'owner':True,'closed':False,'group_size':2,'channel_booking':False}
   elif endpoint=='stayman_close_booking':mutations.append((endpoint,payload));state['closed']=True;body=None
   elif endpoint=='stayman_settlement_history':body=[]
   elif endpoint=='stayman_no_show_sync_state':body={'status':'NOT_LINKED','message':'Direct booking','can_send':False}
   else:errors.append('Unexpected request '+endpoint);body={}
   await route.fulfill(content_type='application/json',body=json.dumps(body))
  await context.route('https://**/*',intercept);page=await context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
  try:
   await page.set_viewport_size({'width':1366,'height':900})
   await page.goto('http://127.0.0.1:4173/')
   first=page.get_by_role('article',name='Web check-in tasks',exact=True);second=page.get_by_role('article',name='Overdue guests',exact=True)
   await expect(first).to_be_visible();await expect(second).to_be_visible()
   await expect(first.get_by_role('button',name='Expand web check-ins',exact=True)).to_have_attribute('aria-expanded','false')
   await page.evaluate("document.documentElement.setAttribute('data-theme','light')")
   assert await page.locator('.attention-green').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(230, 243, 236)'
   assert await page.locator('.attention-amber').evaluate('el=>getComputedStyle(el).backgroundColor')=='rgb(255, 240, 228)'
   stats=await page.locator('.dashboard-stats').bounding_box();cards=await page.locator('.dashboard-attention-cards').bounding_box();assert cards['y']>stats['y']+stats['height']
   await second.get_by_role('button',name='Expand departure review',exact=True).click()
   assert await second.locator('.attention-body').evaluate('el=>el.getBoundingClientRect().height')<=362
   assert await second.locator('.attention-body').evaluate('el=>el.scrollHeight>el.clientHeight')
   await page.set_viewport_size({'width':390,'height':844});await page.reload()
   await expect(page.get_by_role('button',name='Expand departure review',exact=True)).to_have_attribute('aria-expanded','false')
   assert await page.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
   await page.goto('http://127.0.0.1:4173/settings')
   await page.get_by_role('tab',name='Booking policies',exact=True).click()
   await expect(page.get_by_label('Policy name',exact=True)).to_be_visible()
   await page.get_by_label('Policy name',exact=True).fill('Owner standard policy')
   await page.get_by_role('button',name='Save policy for new bookings',exact=True).click()
   await expect(page.get_by_text('Policy saved for new direct bookings.',exact=False)).to_be_visible()
   assert mutations[-1][1]['p_policy']['cancellation']['value']==10000
   await page.goto('http://127.0.0.1:4173/guests?view=guest:'+guest_id)
   await page.get_by_role('button',name='Edit personal details',exact=True).click()
   await page.get_by_label('Full name',exact=True).fill('Corrected QA Guest')
   await page.get_by_label('Correction reason',exact=True).fill('Correct spelling checked against ID')
   await page.get_by_role('button',name='Save correction',exact=True).click()
   await expect(page.get_by_text('Edited by QA Owner',exact=False)).to_be_visible()
   await page.get_by_role('button',name='Close modal',exact=True).click()
   await page.goto('http://127.0.0.1:4173/')
   await page.get_by_role('button',name='Expand departure review',exact=True).click()
   await page.locator('.missed-arrivals summary').click()
   await page.get_by_role('button',name='Review booking',exact=True).click()
   await page.get_by_role('button',name='Mark no-show',exact=True).click()
   await expect(page.get_by_label('Fee retained / charged (INR)',exact=True)).to_have_value('200.00')
   await page.get_by_label('Reason / policy exception',exact=True).fill('Confirmed neither guest arrived')
   await page.get_by_role('checkbox',name='I confirmed that none',exact=False).check()
   await page.get_by_role('button',name='Confirm no-show & settlement',exact=True).click()
   await expect(page.get_by_role('heading',name='No-show settlement',exact=True)).to_be_visible()
   assert state['closed']
   assert mutations[-1][0]=='stayman_close_booking' and mutations[-1][1]['p_fee']==20000
   assert 'stayman_refund' not in calls and 'stayman_record_payment' not in calls
   assert not errors,errors
   print('PASS collapsed bounded dashboard, mobile summary ordering, owner policy settings, personal correction audit, no-show settlement without automatic money movement')
  finally:await browser.close()
asyncio.run(main())
