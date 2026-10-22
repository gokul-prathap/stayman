import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useStaff} from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
import {dayInZone} from '../utils/metrics';
export function useOperations({mode='stock',from,to,page=1}={}) {
 const {property}=useStaff(),client=useQueryClient(),today=dayInZone(new Date(),property.timezone);
 const start=from||today,end=to||today,key=['operations',property.id,mode,start,end,page];
 const query=useQuery({queryKey:key,enabled:start<=end,queryFn:async({signal})=>{
  const {data,error}=await db().rpc('stayman_operations_data',{p_property:property.id,p_mode:mode,p_from:start,p_to:end,p_page:page}).abortSignal(signal);
  if(error)throw error;
  return data;
 }});
 return {...query,refresh:()=>Promise.all([client.invalidateQueries({queryKey:['operations',property.id]}),client.invalidateQueries({queryKey:['stayman',property.id,'dashboard']})])};
}
export async function operationsMutation(name,args) {
 const {data,error}=await db().rpc(name,args);
 if(error) throw error;
 return data;
}
export function operationsError(error) {
 if(/stayman_operations_data/.test(error?.message||''))return 'Operations data is unavailable. Please contact the property administrator.';
 if(/schema cache|does not exist/i.test(error?.message||'')) return 'Operations setup is missing. Apply migration 012 after 011 in Supabase, then refresh.';
 return error?.message||'Unable to save. Please try again.';
}
