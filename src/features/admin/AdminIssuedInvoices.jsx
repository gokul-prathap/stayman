import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {adminRpc} from '../../services/platformAdmin';
import AdminSection from './AdminSection';
import InvoiceAction from '../billing/InvoiceAction';
export default function AdminIssuedInvoices({property}){
 const query=useQuery({queryKey:['admin-issued',property.id],queryFn:()=>adminRpc('stayman_admin_invoices',{p_property:property.id}),retry:false});
 return <AdminSection property={property.id} id="issued-invoices" title="Issued invoices" description="Historical issued records; no approval queue." summary={(query.data?.length??'—')+' records'}>{query.isPending?<p>Loading issued invoices...</p>:query.error?<p role="alert">Issued records couldn't be loaded. Apply the pending administration database update.</p>:query.data.length?<div className="admin-table-wrap"><table className="admin-property-table"><thead><tr><th>Invoice</th><th>Booking</th><th>Issued</th><th/></tr></thead><tbody>{query.data.map(row=><tr key={row.key}><td data-label="Invoice">{row.number}</td><td data-label="Booking">{row.reference}</td><td data-label="Issued">{new Date(row.issuedAt).toLocaleDateString()}</td><td><InvoiceAction reservationId={row.key}/></td></tr>)}</tbody></table></div>:<p>No issued invoices recorded for this property.</p>}</AdminSection>;
}
