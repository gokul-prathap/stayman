import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useStaff} from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
export async function expenseRpc(name,args){const {data,error}=await db().rpc(name,args);if(error)throw error;return data;}
export function expenseError(error){
 if(['PGRST202','42883','42P01'].includes(error?.code)||/schema cache|does not exist/i.test(error?.message||''))return 'Expenses are unavailable. Ask the property administrator to finish setup.';
 return error?.message||'Unable to save. Your entry has been kept; please try again.';
}
export function useExpenseList({from,to,page=1,search='',category='',status='all'}){
 const {property}=useStaff();
 return useQuery({queryKey:['expenses',property.id,from,to,page,search,category,status],enabled:!!from&&!!to&&from<=to,
  queryFn:({signal})=>db().rpc('stayman_expense_list',{p_property:property.id,p_from:from,p_to:to,p_page:page,p_search:search,p_category:category,p_status:status}).abortSignal(signal).then(({data,error})=>{if(error)throw error;return data;})});
}
export function useFinanceReport(from,to,enabled=true){
 const {property}=useStaff();
 return useQuery({queryKey:['finance',property.id,from,to],enabled:enabled&&!!from&&!!to&&from<=to,staleTime:60000,retry:false,
 queryFn:({signal})=>db().rpc('stayman_finance_report',{p_property:property.id,p_from:from,p_to:to}).abortSignal(signal).then(({data,error})=>{if(error)throw error;return data;})});
}
export function useExpenseRefresh(){const client=useQueryClient(),{property}=useStaff();return ()=>Promise.all(['expenses','finance','operations','stayman'].map(key=>client.invalidateQueries({queryKey:[key,property.id]})));}
