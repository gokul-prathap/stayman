import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useStaff} from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
import {useVisiblePolling} from './useVisiblePolling';
import {useEffect,useRef} from 'react';
import {refreshPropertyQueries} from '../../../services/queryInvalidation';

export function useCheckinNotifications({watchChanges=false}={}) {
 const {property}=useStaff(),client=useQueryClient(),key=['stayman',property.id,'notifications'];
 const interval=useVisiblePolling(60000);
 const query=useQuery({queryKey:key,staleTime:60000,refetchInterval:interval,queryFn:async({signal})=>{
  const {data,error}=await db().rpc('stayman_checkin_notifications',{p_property:property.id}).abortSignal(signal);
  if(error)throw error;
  return data;
 }});
 const previous=useRef(null);
 useEffect(()=>{
  const revision=query.data?.revision;
  if(watchChanges&&previous.current&&revision&&previous.current!==revision){
   client.invalidateQueries({queryKey:['stayman',property.id],predicate:q=>q.queryKey[2]!=='notifications'},{cancelRefetch:false});
   client.invalidateQueries({queryKey:['operations',property.id]});
   client.invalidateQueries({queryKey:['guest-directory',property.id]});
  }
  previous.current=revision||null;
 },[query.data?.revision,property.id,watchChanges,client]);
 return {...query,refresh:()=>refreshPropertyQueries(client,property.id),refreshNotifications:()=>client.invalidateQueries({queryKey:key})};
}
