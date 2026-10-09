import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CheckCircle2, FileCheck2 } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import DocumentPreview from '../components/DocumentPreview';
import { validateGuestDetails } from '../utils/guestCheckinValidation';
import { client, openInvitation, compressIdentityImage, submitGuestCheckin } from '../services/guestCheckinService';

const initial = { full_name: '', email: '', phone: '', arrival_date: '', departure_date: '', coming_from: '', going_to: '', foreign_guest: false };

export default function GuestCheckinPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.hash.slice(1)).get('invite') || new URLSearchParams(location.search).get('invite') || '';
  const [invitation, setInvitation] = useState(null);
  const [details, setDetails] = useState(initial);
  const [photos, setPhotos] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState({});
  const [error, setError] = useState('');
  const versions = useRef({ front: 0, back: 0 });

  useEffect(() => {
    let active = true;
    setInvitation(null); setDetails(initial); setError('');
    setReviewing(false); setConfirmed(false);
    setPhotos({}); setProcessing({});
    versions.current.front++; versions.current.back++;
    if (!token || !clientAvailable()) return;
    setBusy(true);
    openInvitation(token).then(row => {
      if (active) {
        setInvitation(row);
        setDetails(previous => ({ ...previous, email: row.email || '' }));
      }
    }).catch(err => { if (active) setError(err.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token]);

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
    event.preventDefault();
    setError('');
    try {
      const cleaned = validateGuestDetails(details);
      if (processing.front || processing.back || !photos.front || !photos.back) {
        throw new Error('Please choose both document photos and wait for compression.');
      }
      if (!reviewing) {
        setDetails(cleaned); setConfirmed(false); setReviewing(true);
        return;
      }
      if (!confirmed) throw new Error('Please confirm that your details and documents are correct.');
      if (busy) return;
      setBusy(true);
      const row = await submitGuestCheckin(invitation, cleaned, photos);
      setInvitation(row); setPhotos({}); setReviewing(false);
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

          {!token ? <p className="text-sm text-slate-600">Please scan the invitation QR code provided by reception.</p> :
            !clientAvailable() ? <p className="text-sm text-slate-600">Guest check-in is not configured. Please contact reception.</p> :
            completed ? <div role="status" className="rounded-lg bg-emerald-50 p-5 text-emerald-800"><CheckCircle2 className="mb-2" /><h2 className="font-semibold">Already uploaded</h2><p className="mt-1 text-sm">Your details and documents have been submitted. Contact reception if a correction is needed.</p></div> :
            !invitation ? <div role="status" className="text-sm text-slate-600">
              {busy ? 'Opening your invitation...' : 'Unable to open this invitation. Please refresh or contact reception.'}
            </div> :
            reviewing ? <form onSubmit={submit} className="space-y-5">
              <h2 className="text-lg font-semibold text-slate-900">Review your check-in</h2>
              <p className="text-sm text-slate-500">Check your details and make sure both compressed photos are readable before submitting.</p>
              <dl className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2">
                {[
                  ['Full name', details.full_name], ['Email', details.email],
                  ['Phone number', details.phone], ['Date of arrival', details.arrival_date],
                  ['Departure date', details.departure_date], ['Coming from', details.coming_from],
                  ['Going to', details.going_to],
                  ['Documents', details.foreign_guest ? 'Passport and visa' : 'ID front and back'],
                ].map(([label, value]) => <div key={label}>
                  <dt className="text-xs text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
                </div>)}
              </dl>
              <div className="grid gap-4 sm:grid-cols-2">
                <DocumentPreview blob={photos.front} label={details.foreign_guest ? 'Passport front' : 'ID front side'} />
                <DocumentPreview blob={photos.back} label={details.foreign_guest ? 'Visa' : 'ID back side'} />
              </div>
              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" required checked={confirmed} disabled={busy} className="mt-1"
                  onChange={event => setConfirmed(event.target.checked)} />
                I confirm that my details are correct and both document photos are readable.
              </label>
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="secondary" disabled={busy} onClick={() => {
                  setReviewing(false); setConfirmed(false); setError('');
                }}>Edit details / photos</Button>
                <Button disabled={busy || !confirmed}>{busy ? 'Uploading...' : 'Confirm and upload'}</Button>
              </div>
              <p className="text-xs text-slate-500">After submission, contact reception to arrange any corrections.</p>
            </form> :
            <form onSubmit={submit} className="space-y-5">
              <fieldset disabled={busy} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Full name" name="full_name" autoComplete="name" required maxLength={120} value={details.full_name} onChange={update} />
                  <Input label="Email" name="email" type="email" autoComplete="email" required maxLength={254} value={details.email} onChange={update} />
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
                    <Input label={details.foreign_guest ? (side === 'front' ? 'Passport front' : 'Visa') : (side === 'front' ? 'ID front side' : 'ID back side')} type="file" accept="image/jpeg,image/png,image/webp" required={!photos[side]} onChange={event => choosePhoto(side, event.target.files?.[0])} />
                    <p className="mt-2 text-xs text-slate-500" aria-live="polite">{processing[side] ? 'Compressing photo…' : photos[side] ? `Ready · ${Math.ceil(photos[side].size / 1024)} KB` : 'JPEG, PNG or WebP, up to 10 MB.'}</p>
                  </div>)}
                </div>
                <p className="text-xs text-slate-500">Photos are compressed to a maximum of 1 MB each. Choose another photo to replace it. Next, review your details and the compressed photos before uploading.</p>
                <Button disabled={busy || processing.front || processing.back || !photos.front || !photos.back}>{busy ? 'Please wait...' : 'Review details and photos'}</Button>
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
