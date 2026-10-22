import { useQuery, useQueryClient } from '@tanstack/react-query';
import {useEffect} from 'react';
import { useStaff } from '../../../components/auth/StaffGate';
import {db} from '../../../services/stayman';
import {normalizePropertyData,mergeCheckinStatuses} from '../../../services/propertyData';
import {dayInZone,shiftDay} from '../../management/utils/metrics';
import {useVisiblePolling} from './useVisiblePolling';
import {refreshPropertyQueries} from '../../../services/queryInvalidation';
export function usePropertyData({refetchInterval=false,mode='window',from,to,reservationId=null,page=1,size=25,search='',filter='all',enabled=true} = {}) {
  const { property } = useStaff();
  const client = useQueryClient();
  const today=dayInZone(new Date(),property.timezone),start=from||today,end=to||shiftDay(today,30);
  const key = ['stayman', property.id,mode,start,end,reservationId,page,size,search,filter];
  const interval=useVisiblePolling(refetchInterval);
  const query = useQuery({queryKey:key,enabled,staleTime:mode==='reservation'?0:mode==='inventory'?300000:60000,refetchOnWindowFocus:mode==='reservation',refetchInterval:interval,queryFn:async({signal})=>{
    const {data,error}=await db().rpc('stayman_workspace_data',{p_property:property.id,p_mode:mode,p_from:start,p_to:end,p_reservation:reservationId,p_page:page,p_size:size,p_search:search,p_filter:filter}).abortSignal(signal);
    if(error)throw error;
    return normalizePropertyData(data);
  }});
  useEffect(()=>{
    if(mode!=='reservation'||!query.data)return;
    for(const [key,cached] of client.getQueriesData({queryKey:['stayman',property.id],predicate:q=>q.queryKey[2]!=='reservation'})){
      const updated=mergeCheckinStatuses(cached,query.data);
      if(updated!==cached)client.setQueryData(key,updated,{updatedAt:client.getQueryState(key)?.dataUpdatedAt});
    }
  },[mode,property.id,query.data,client]);
  return {...query,refresh:()=>refreshPropertyQueries(client,property.id)};
}
