import React, { useEffect, useState } from 'react';
import { useStaff } from '../../../components/auth/StaffGate';
import { usePropertyData } from '../../reservations/hooks/usePropertyData';
import { saveSettings, databaseError } from '../../../services/stayman';
import PageState from '../../management/components/PageState';
import '../../management/management.css';
const tabs = ['Property','Users','Preferences','System'];
export default function SettingsPage() {
  const { property, reloadProperties } = useStaff();
  const { data, isPending, error, refresh } = usePropertyData();
  const [tab, setTab] = useState('Property'), [form,setForm] = useState({}), [busy,setBusy] = useState(false);
  const [message,setMessage] = useState(''), [saveError,setSaveError] = useState('');
  useEffect(() => {
    setForm({ name: property.name, address: property.address || '', phone: property.phone || '', currency:'INR',
      timezone: property.timezone || 'Asia/Kolkata', check_in_time: (property.check_in_time || '14:00').slice(0,5),check_out_time:(property.check_out_time || '11:00').slice(0,5) });
    setMessage(''); setSaveError('');
  }, [property]);
  const change = (key,value) => { setForm(f => ({ ...f,[key]:value })); setMessage(''); };
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setSaveError('');
    try { await saveSettings(property.id,form); await reloadProperties(); await refresh(); setMessage('Property settings saved.'); }
    catch(err) { setSaveError(databaseError(err)); } finally { setBusy(false); }
  }
  const field = (key,label,extra={}) => <label>{label}<input {...extra} value={form[key] || ''} onChange={e => change(key,e.target.value)} /></label>;
  const timezoneOptions = [...new Set(['Asia/Kolkata','UTC','Asia/Bangkok','Europe/London','America/New_York',form.timezone].filter(Boolean))];
  return <section className="management space-y-5"><h1>Settings</h1><p className="subtitle">Manage your property and workspace.</p><div className="tabs" role="tablist" aria-label="Settings section">{tabs.map(t => <button key={t} role="tab" aria-selected={t===tab} onClick={() => setTab(t)}>{t}</button>)}</div><PageState pending={isPending} error={error} retry={refresh}/>
    {data && !error && <div className="max-w-3xl">
      {(tab === 'Property' || tab === 'Preferences') && <form onSubmit={save} className="card"><fieldset disabled={busy || !data.isOwner} className="space-y-6"><h2>{tab === 'Property' ? 'Property Details' : 'Regional Preferences'}</h2>
        {!data.isOwner && <p className="notice">Only a property owner can edit these settings.</p>}
        {tab === 'Property' && <>{field('name','Property Name',{required:true,minLength:2,maxLength:100})}{field('address','Address',{maxLength:500})}{field('phone','Contact Phone',{type:'tel',maxLength:25})}</>}
        <div className="grid gap-5 sm:grid-cols-2"><label>Currency<select value="INR" onChange={() => {}}><option value="INR">INR (₹)</option></select></label><label>Timezone<select value={form.timezone || 'Asia/Kolkata'} onChange={e => change('timezone',e.target.value)}>{timezoneOptions.map(t => <option key={t}>{t}</option>)}</select></label></div>
        <p className="muted">Payments and room rates use INR. The timezone controls staff reports and guest stay labels.</p>
        {tab === 'Property' && <div className="grid gap-5 sm:grid-cols-2">{field('check_in_time','Check-in Time',{type:'time',required:true})}{field('check_out_time','Check-out Time',{type:'time',required:true})}</div>}
        {saveError && <p role="alert" className="error">{saveError}</p>}{message && <p role="status" className="success">{message}</p>}<div className="flex justify-end"><button className="primary">{busy ? 'Saving...' : 'Save Changes'}</button></div>
      </fieldset></form>}
      {tab === 'Users' && <div className="card"><h2>Property Users</h2><p className="muted mt-2">Staff with access to {property.name}. Accounts and roles are managed by the administrator in Supabase.</p><div className="mt-5 overflow-x-auto"><table><thead><tr><th>Email</th><th>Role</th></tr></thead><tbody>{data.team.map(member => <tr key={member.user_id}><td>{member.email}</td><td>{member.role}</td></tr>)}</tbody></table></div></div>}
      {tab === 'System' && <div className="card space-y-5"><h2>System</h2><dl className="grid grid-cols-2 gap-4 text-sm"><dt className="muted">Application</dt><dd>Stayman</dd><dt className="muted">Database</dt><dd className="text-emerald-600">Connected to Supabase</dd><dt className="muted">Property</dt><dd>{property.name}</dd><dt className="muted">Payment handling</dt><dd>Manual payment records</dd></dl><p className="notice">Payment entries record money already collected. This application does not charge cards or process bank transfers.</p><a href="/guest-check-in" target="_blank" rel="noreferrer" className="secondary inline-block">Open guest check-in</a></div>}
    </div>}
  </section>;
}
