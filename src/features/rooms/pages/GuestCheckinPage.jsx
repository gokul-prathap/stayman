import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, FileCheck2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { client, claimInvitation, compressIdentityImage, submitGuestCheckin } from '../services/guestCheckinService';

const initial = { full_name: '', phone: '', arrival_date: '', departure_date: '', coming_from: '', going_to: '', foreign_guest: false };

export default function GuestCheckinPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.hash.slice(1)).get('invite') || new URLSearchParams(location.search).get('invite') || '';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [details, setDetails] = useState(initial);
  const [photos, setPhotos] = useState({});
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const versions = useRef({ front: 0, back: 0 });

  useEffect(() => {
    let active = true;
    if (!token || !clientAvailable()) return;
    client().auth.getSession().then(async ({ data, error: sessionError }) => {
      if (sessionError) throw sessionError;
      if (!data.session) return;
      const row = await claimInvitation(token);
      if (active) { setInvitation(row); setEmail(row.email); }
    }).catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [token]);

  async function authenticate(event) {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if (!sent) {
        const { error: authError } = await client().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
        if (authError) throw authError;
        setSent(true); setNotice('Enter the verification code sent to your email.');
      } else {
        const { error: authError } = await client().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
        if (authError) throw authError;
        const row = await claimInvitation(token);
        setInvitation(row); setEmail(row.email);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function choosePhoto(side, file) {
    const version = ++versions.current[side];
    setPhotos(previous => ({ ...previous, [side]: null }));
    if (!file) { setProcessing(previous => ({ ...previous, [side]: false })); return; }
    setProcessing(previous => ({ ...previous, [side]: true })); setError('');
    try {
      const blob = await compressIdentityImage(file);
      if (versions.current[side] === version) setPhotos(previous => ({ ...previous, [side]: blob }));
    } catch (err) {
      if (versions.current[side] === version) setError(err.message);
    } finally {
      if (versions.current[side] === version) setProcessing(previous => ({ ...previous, [side]: false }));
    }
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (details.departure_date < details.arrival_date) throw new Error('Departure must be on or after arrival.');
      const row = await submitGuestCheckin(invitation, details, photos);
      setInvitation(row); setPhotos({});
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const update = event => setDetails(previous => ({ ...previous, [event.target.name]: event.target.value }));
  const completed = invitation?.status === 'completed';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <p className="mb-6 text-xl font-bold tracking-tight text-slate-900">Stayman</p>
        <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-8">
          <FileCheck2 className="mb-4 text-slate-700" size={28} />
          <h1 className="text-2xl font-bold text-slate-900">Guest check-in</h1>
          <p className="mt-2 mb-6 text-sm text-slate-500">Complete your arrival details and securely submit your identity documents.</p>
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {notice && !invitation && <p role="status" className="mb-4 text-sm text-slate-600">{notice}</p>}
          {!token ? <p className="text-sm text-slate-600">Please scan the invitation QR code provided by reception.</p> :
            !clientAvailable() ? <p className="text-sm text-slate-600">Guest check-in is not configured. Please contact reception.</p> :
            completed ? <div role="status" className="rounded-lg bg-emerald-50 p-5 text-emerald-800"><CheckCircle2 className="mb-2" /><h2 className="font-semibold">Already uploaded</h2><p className="mt-1 text-sm">Your details and documents have been submitted. Contact reception if a correction is needed.</p></div> :
            !invitation ? <form onSubmit={authenticate} className="space-y-4">
              <Input label="Email" type="email" autoComplete="email" required maxLength={254} value={email} disabled={sent || busy} onChange={event => setEmail(event.target.value)} />
              {sent && <Input label="Email verification code" inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6,8}" value={code} onChange={event => setCode(event.target.value)} />}
              <Button disabled={busy}>{busy ? 'Please wait…' : sent ? 'Verify and continue' : 'Send verification code'}</Button>
              {sent && <Button type="button" variant="ghost" disabled={busy} onClick={() => { setSent(false); setCode(''); setNotice(''); }}>Change email / resend</Button>}
              <p className="text-xs text-slate-500">Use the email associated with your invitation.</p>
            </form> :
            <form onSubmit={submit} className="space-y-5">
              <fieldset disabled={busy} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Full name" name="full_name" autoComplete="name" required maxLength={120} value={details.full_name} onChange={update} />
                  <Input label="Email" type="email" value={email} readOnly />
                  <Input label="Phone number" name="phone" type="tel" autoComplete="tel" required pattern="[+0-9() .-]{7,25}" maxLength={25} value={details.phone} onChange={update} />
                  <Input label="Date of arrival" name="arrival_date" type="date" required value={details.arrival_date} onChange={update} />
                  <Input label="Departure date" name="departure_date" type="date" min={details.arrival_date || undefined} required value={details.departure_date} onChange={update} />
                  <Input label="Coming from" name="coming_from" required maxLength={160} value={details.coming_from} onChange={update} />
                  <Input label="Going to" name="going_to" required maxLength={160} value={details.going_to} onChange={update} />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={details.foreign_guest} onChange={event => {
                  setDetails(previous => ({ ...previous, foreign_guest: event.target.checked }));
                  versions.current.front++; versions.current.back++;
                  setPhotos({}); setProcessing({});
                }} />I am a foreign guest (passport and visa required)</label>
                <div className="grid gap-4 sm:grid-cols-2" key={String(details.foreign_guest)}>
                  {['front', 'back'].map(side => <div key={side}>
                    <Input label={details.foreign_guest ? (side === 'front' ? 'Passport front' : 'Visa') : (side === 'front' ? 'ID front side' : 'ID back side')} type="file" accept="image/jpeg,image/png,image/webp" required onChange={event => choosePhoto(side, event.target.files?.[0])} />
                    <p className="mt-2 text-xs text-slate-500" aria-live="polite">{processing[side] ? 'Compressing photo…' : photos[side] ? `Ready · ${Math.ceil(photos[side].size / 1024)} KB` : 'JPEG, PNG or WebP, up to 10 MB.'}</p>
                  </div>)}
                </div>
                <p className="text-xs text-slate-500">Photos are compressed to a maximum of 1 MB each. Choose another photo to replace it before submitting. Please ensure the details are readable. After submission, reception must arrange any corrections.</p>
                <Button disabled={busy || processing.front || processing.back || !photos.front || !photos.back}>{busy ? 'Uploading…' : 'Submit check-in'}</Button>
              </fieldset>
            </form>}
        </div>
      </div>
    </main>
  );
}

function clientAvailable() {
  try { client(); return true; } catch { return false; }
}
