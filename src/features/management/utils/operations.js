export const expenseCategories = ['ELECTRICITY','WATER','CLEANING','LAUNDRY','LINEN','SUPPLIES','SALARY','RENT','INTERNET','WASTE','REPAIRS','OTHER'];
export const stockActions = {
 RECEIVE: { label:'Receive / opening stock', from:null, to:'clean' },
 RECEIVE_DIRTY: { label:'Opening stock: dirty', from:null, to:'dirty' },
 RECEIVE_IN_USE: { label:'Opening stock: in use', from:null, to:'in_use' },
 RECEIVE_LAUNDRY: { label:'Opening stock: at laundry', from:null, to:'laundry' },
 ISSUE: { label:'Put clean linen in use', from:'clean', to:'in_use' },
 DIRTY: { label:'Collect used linen as dirty', from:'in_use', to:'dirty' },
 SEND_LAUNDRY: { label:'Send dirty linen to laundry', from:'dirty', to:'laundry' },
 RETURN: { label:'Return clean linen from laundry', from:'laundry', to:'clean' },
 DISCARD_CLEAN: { label:'Discard clean linen', from:'clean', to:null },
 DISCARD_DIRTY: { label:'Discard dirty linen', from:'dirty', to:null },
 CONSUME: { label:'Use supplies', from:'clean', to:null },
};
export function actionsFor(item) {
 return Object.entries(stockActions).filter(([key])=>item.kind==='SUPPLY'?['RECEIVE','CONSUME'].includes(key):key!=='CONSUME');
}
export function stockTotal(item) {
 return ['clean','in_use','dirty','laundry'].reduce((sum,key)=>sum+Number(item[key]||0),0);
}
export function previewMovement(item,action,quantity) {
 const rule=stockActions[action],q=Number(quantity);
 if(!actionsFor(item).some(([key])=>key===action)||!Number.isFinite(q)||q<=0||q>1000000||Math.abs(q*100-Math.round(q*100))>1e-6||(item.kind==='LINEN'&&!Number.isInteger(q))) throw new Error('Enter a valid quantity; linen uses whole pieces.');
 const result={...item};
 if(rule.from) {
  if(Number(item[rule.from])<q) throw new Error('Not enough stock in the selected state.');
  result[rule.from]=Math.round((Number(item[rule.from])-q)*100)/100;
 }
 if(rule.to) result[rule.to]=Math.round((Number(item[rule.to])+q)*100)/100;
 return result;
}
export function expenseSummary(expenses=[],from,to) {
 const active=expenses.filter(e=>!e.voided_at);
 const inPeriod=day=>day && day>=from && day<=to;
 return {
  incurred:active.filter(e=>inPeriod(e.expense_date)).reduce((s,e)=>s+Number(e.amount_paise),0),
  paid:active.filter(e=>inPeriod(e.paid_date)).reduce((s,e)=>s+Number(e.amount_paise),0),
  unpaid:active.filter(e=>!e.paid_date&&e.expense_date<=to).reduce((s,e)=>s+Number(e.amount_paise),0),
  units:active.filter(e=>e.category==='ELECTRICITY'&&inPeriod(e.expense_date)).reduce((s,e)=>s+Number(e.units_consumed||0),0),
 };
}
