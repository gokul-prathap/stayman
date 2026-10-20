import React,{useState} from 'react';
import {db,databaseError} from '../../../services/stayman';
import RotatableDocumentImage from '../../rooms/components/RotatableDocumentImage';
export function IdentityPhoto({invitationId,side}) {
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function load(){setBusy(true);setError('');try{const {data,error}=await db().storage.from('guest-identities').createSignedUrl(invitationId+'/'+side+'.jpg',120);if(error)throw error;setUrl(data.signedUrl);}catch(e){setError(databaseError(e));}finally{setBusy(false);}}
 return <div>{url?<div><RotatableDocumentImage src={url} label={side==='front'?'Identity document front':'Identity document back or visa'} onError={()=>{setUrl('');setError('ID unavailable or expired. Click to retry.');}}/><button type="button" className="secondary mt-2" onClick={()=>setUrl('')}>Hide ID</button></div>:<button type="button" disabled={busy} onClick={load} className="identity-placeholder"><span className="identity-skeleton" aria-hidden="true"><i/><i/><i/></span><span>{busy?'Loading securely…':'Click to load ID'}<small>{side==='front'?'Front / passport':'Back / visa'}</small></span></button>}{error&&<p role="alert" className="error mt-2">{error}</p>}</div>;
}
export default function GuestSubmission({submission}) {
 if(submission?.status!=='completed')return <p className="notice">Web check-in not done. No ID documents submitted yet.</p>;
 const screening=submission.details?.document_screening;
 const needsReview=!screening||Object.values(screening).includes('manual-review');
 return <div className="space-y-4">{needsReview?<p role="status" className="notice">ID review required: the automatic check was inconclusive or not recorded. Inspect the uploaded photos and the original document before checking in.</p>:<p className="muted">Document text detected on the guest device. This does not verify identity or authenticity; check the original ID.</p>}<p className="text-xs font-semibold text-emerald-700">Web check-in done</p><dl className="grid grid-cols-2 gap-3 text-xs">{Object.entries(submission.details||{}).filter(([key])=>key!=="document_screening").map(([key,value])=><div key={key}><dt className="muted capitalize">{key.replaceAll('_',' ')}</dt><dd className="mt-1 break-words">{typeof value==='boolean'?(value?'Yes':'No'):String(value)}</dd></div>)}</dl><div className="grid gap-3 sm:grid-cols-2">{(submission.details?.document_sides||['front','back']).map(side=><IdentityPhoto key={submission.invitation_id+side} invitationId={submission.invitation_id||submission.id} side={side}/>)}</div><p className="muted">ID photos are loaded only after clicking. Submitted details are preserved as received.</p></div>;
}
