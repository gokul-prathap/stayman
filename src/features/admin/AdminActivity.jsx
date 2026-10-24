import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {adminRpc} from '../../services/platformAdmin';
import AdminSection from './AdminSection';
export default function AdminActivity({property,rows}){
 const query=useQuery({queryKey:['admin-activity',property?.id||'platform'],enabled:!rows,queryFn:()=>adminRpc('stayman_admin_activity_list',{p_property:property?.id||null}),retry:false});
 const items=rows||query.data||[];
 return <AdminSection property={property?.id} id="activity" title="Recent changes" description="Recorded changes, their actor and outcome." summary={items.length+' records'}>{query.error?<p role="alert">Activity isn't available yet. Apply the pending administration database update.</p>:query.isPending&&!rows?<p>Loading activity...</p>:items.length?<div className="admin-activity-list">{items.map(item=><article key={item.id}><div><strong>{item.action}</strong><small>{item.property} / {item.actor}</small></div><div><span>{item.outcome}</span><small>{new Date(item.at).toLocaleString(undefined,{timeZone:property?.timezone||'Asia/Kolkata'})}</small></div></article>)}</div>:<p className="muted">No changes recorded yet. Older activity isn't reconstructed.</p>}</AdminSection>;
}
