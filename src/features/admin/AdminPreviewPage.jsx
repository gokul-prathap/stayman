import React,{useEffect,useMemo,useState} from 'react';
import AiosellAdminSetup from '../rooms/components/AiosellAdminSetup';
import {AiosellOwnerPanel} from '../rooms/components/AiosellSettings';
import {createAdminPreview} from './adminPreview';
import AdminSection from './AdminSection';
import '../management/management.css';
import './admin.css';
export default function AdminPreviewPage(){
 const [scenario,setScenario]=useState('CONNECTED'),[outcome,setOutcome]=useState('success'),[dark,setDark]=useState(false),[mobile,setMobile]=useState(false);
 const preview=useMemo(()=>createAdminPreview(scenario),[scenario]);preview.api.outcome=outcome;
 useEffect(()=>{const previous=document.documentElement.dataset.theme;document.documentElement.dataset.theme=dark?'dark':'light';return()=>{if(previous)document.documentElement.dataset.theme=previous;else delete document.documentElement.dataset.theme;};},[dark]);
 return <main className="management aiosell-preview-page"><aside className="aiosell-preview-controls"><strong>SIMULATED ADMIN PREVIEW / No live requests</strong><label>Setup scenario<select aria-label="Setup scenario" value={scenario} onChange={e=>setScenario(e.target.value)}>{['UNCONFIGURED','INCOMPLETE','READY','CONNECTED','FETCH_FAILED','LINKED_BOOKINGS'].map(s=><option key={s}>{s}</option>)}</select></label><label>Delivery<select aria-label="Delivery" value={outcome} onChange={e=>setOutcome(e.target.value)}>{['success','partial','failure','unconfirmed'].map(s=><option key={s}>{s}</option>)}</select></label><label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>Dark theme</label><label><input type="checkbox" checked={mobile} onChange={e=>setMobile(e.target.checked)}/>Mobile width</label><a href="/preview/aiosell">Owner controls preview</a></aside><div className="admin-workspace aiosell-preview-device" style={{maxWidth:mobile?390:1100}}><header className="admin-property-header"><div><small>Properties / Example property / Aiosell</small><h1>Example property</h1><p>Sample categories and units only. Production fetches real Aiosell categories.</p></div></header><AiosellAdminSetup key={scenario} {...preview} api={preview.api}/><AdminSection property={preview.property.id} id="owner-preview" title="Preview saved owner page" description="Read-only view of the same simulated saved matches." defaultOpen={false}><AiosellOwnerPanel key={scenario} property={preview.property} adapter={preview.owner} readOnly pricingHref="/preview/aiosell#preview-pricing"/></AdminSection></div></main>;
}
