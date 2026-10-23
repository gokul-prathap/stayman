import {shiftDay,nights} from './metrics.js';

export const costKinds={OPERATING:'Operating expense',EQUIPMENT:'Equipment purchase',DEPOSIT:'Refundable deposit',OWNER_CONTRIBUTION:'Owner contribution',OWNER_WITHDRAWAL:'Owner withdrawal'};
export const categoryLabel=value=>value?.charAt(0)+value?.slice(1).toLowerCase();
export function monthStart(day){return day.slice(0,7)+'-01';}
export function addMonths(day,amount){
 const [y,m,d]=day.split('-').map(Number),date=new Date(Date.UTC(y,m-1+amount,1));
 const end=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
 date.setUTCDate(Math.min(d,end));return date.toISOString().slice(0,10);
}
export function comparisonPeriod(from,to){
 if(from===monthStart(from)&&from.slice(0,7)===to.slice(0,7)){
  const start=addMonths(from,-1),end=shiftDay(from,-1);
  return {from:start,to:to===shiftDay(addMonths(from,1),-1)?end:shiftDay(start,Math.min(nights(from,to),nights(start,end)))};
 }
 const count=nights(from,to)+1;return {from:shiftDay(from,-count),to:shiftDay(from,-1)};
}
export function percentChange(current,previous){return previous>0?(current-previous)/previous*100:null;}
const inside=(day,from,to)=>day>=from&&day<=to;
export function summarizeFinance(data,from,to){
 const days=(data?.days||[]).filter(d=>inside(d.day,from,to));
 const sums=Object.fromEntries(['revenue','feeRevenue','cost','paid','receipts','occupied','propertyOut'].map(key=>[key,days.reduce((s,d)=>s+Number(d[key]||0),0)]));
 return {...sums,result:sums.revenue+sums.feeRevenue-sums.cost,cash:sums.receipts-sums.paid,propertyCash:sums.receipts-sums.propertyOut,days};
}
export function categoryTotals(data,from,to,category){
 const rows=(data?.categories||[]).filter(r=>r.cost_kind==='OPERATING'&&(!category||r.category===category)&&inside(r.day,from,to));
 const total=key=>rows.reduce((s,r)=>s+Number(r[key]||0),0);
 const refunds=(data?.refunds||[]).filter(r=>r.cost_kind==='OPERATING'&&(!category||r.category===category)&&inside(r.day,from,to)).reduce((s,r)=>s+Number(r.amount),0);
 const occupied=summarizeFinance(data,from,to).occupied;
 return {amount:total('amount')-refunds,billed:total('amount'),refunds,bills:total('bills'),kwh:total('kwh'),missingUnits:total('missing_units'),missingPeriod:total('missing_period'),
  kwhPerDay:total('billing_days')?total('period_kwh')/total('billing_days'):null,
  pieces:total('pieces'),piecesCost:total('pieces_cost'),kg:total('kg'),kgCost:total('kg_cost'),occupied};
}
export function monthlyFinance(data,to){
 const start=addMonths(monthStart(to),-5);
 return Array.from({length:6},(_,i)=>{const from=addMonths(start,i),end=from.slice(0,7)===to.slice(0,7)?to:shiftDay(addMonths(from,1),-1);
 return {label:from.slice(0,7),from,to:end,...summarizeFinance(data,from,end)};});
}
export function csvText(rows){
 // Neutralize spreadsheet formulas in user-entered descriptions/suppliers.
 return '\ufeff'+rows.map(row=>row.map(value=>{
  const raw=String(value??''),safe=typeof value==='string'&&/^[\s]*[=+\-@]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replaceAll('"','""')+'"';
 }).join(',')).join('\r\n');
}
export function downloadCsv(name,rows){
 const url=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function financeCsv(data,from,to,propertyName){
 const s=summarizeFinance(data,from,to),prev=comparisonPeriod(from,to);
 const rows=[['Income & expenses',propertyName],['Period',from,to],['Amounts in INR; based on recorded bills, not complete accounting profit'],
  ['Measure','INR'],...Object.entries({'Stay revenue':s.revenue,'Cancellation/no-show fees':s.feeRevenue,'Closure fees outstanding now':data.closureOutstandingNow,'Closure refunds due now':data.closureRefundDueNow,'Operating expenses':s.cost,'Operating result':s.result,'Net guest receipts':s.receipts,'Operating expenses paid':s.paid,'Net operating cash movement':s.cash,'Net property cash movement':s.propertyCash,'Outstanding bills at period end':data.outstanding,'Staff reimbursements outstanding':data.staffOwed}).map(([label,value])=>[label,Number(value||0)/100]),
  [],['Category','Current INR','Previous INR','Previous from','Previous to']];
 for(const category of [...new Set((data.categories||[]).filter(r=>r.cost_kind==='OPERATING').map(r=>r.category))]) rows.push([categoryLabel(category),categoryTotals(data,from,to,category).amount/100,categoryTotals(data,prev.from,prev.to,category).amount/100,prev.from,prev.to]);
 for(const category of ['ELECTRICITY','LAUNDRY']){
  const c=categoryTotals(data,from,to,category),p=categoryTotals(data,prev.from,prev.to,category);
  rows.push([], [categoryLabel(category),'Current','Previous'],['Bills recorded',c.bills,p.bills],['Occupied unit nights (rooms and beds combined)',c.occupied,p.occupied]);
  if(category==='ELECTRICITY') rows.push(['kWh (recorded)',c.kwh,p.kwh],['Bills missing kWh',c.missingUnits,p.missingUnits],['kWh per billed day',c.kwhPerDay??'',p.kwhPerDay??'']);
  else rows.push(['Pieces',c.pieces,p.pieces],['Cost per piece INR',c.pieces?c.piecesCost/c.pieces/100:'',p.pieces?p.piecesCost/p.pieces/100:''],['Kilograms',c.kg,p.kg],['Cost per kg INR',c.kg?c.kgCost/c.kg/100:'',p.kg?p.kgCost/p.kg/100:'']);
 }
 rows.push([],['Date','Stay revenue INR','Cancellation/no-show fees INR','Operating cost INR','Operating result INR','Net guest receipts INR','Operating expenses paid INR','Occupied unit nights']);
 s.days.forEach(d=>rows.push([d.day,Number(d.revenue)/100,Number(d.feeRevenue||0)/100,Number(d.cost)/100,(Number(d.revenue)+Number(d.feeRevenue||0)-Number(d.cost))/100,Number(d.receipts)/100,Number(d.paid)/100,d.occupied]));
 return rows;
}
