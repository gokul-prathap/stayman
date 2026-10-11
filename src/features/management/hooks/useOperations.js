import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useStaff} from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
async function rows(table,property) {
 const result=[];
 for(let offset=0;;offset+=1000) {
  const {data,error}=await db().from(table).select('*').eq('property_id',property).order('id').range(offset,offset+999);
  if(error) throw error;
  result.push(...data);
  if(data.length<1000) return result;
 }
}
export function useOperations() {
 const {property}=useStaff(),client=useQueryClient(),key=['operations',property.id];
 const query=useQuery({queryKey:key,queryFn:async()=>{
  const [items,movements,expenses,events,owner]=await Promise.all([...['stayman_stock_items','stayman_stock_movements','stayman_expenses','stayman_expense_events'].map(t=>rows(t,property.id)),db().rpc('stayman_is_owner',{p_property:property.id})]);
  if(owner.error) throw owner.error;
  return {isOwner:owner.data,items:items.sort((a,b)=>a.name.localeCompare(b.name)),movements:movements.sort((a,b)=>b.created_at.localeCompare(a.created_at)),expenses:expenses.sort((a,b)=>b.expense_date.localeCompare(a.expense_date)||b.created_at.localeCompare(a.created_at)),events};
 }});
 return {...query,refresh:()=>client.invalidateQueries({queryKey:key})};
}
export async function operationsMutation(name,args) {
 const {data,error}=await db().rpc(name,args);
 if(error) throw error;
 return data;
}
export function operationsError(error) {
 if(/schema cache|does not exist/i.test(error?.message||'')) return 'Operations setup is missing. Apply migration 012 after 011 in Supabase, then refresh.';
 return error?.message||'Unable to save. Please try again.';
}
