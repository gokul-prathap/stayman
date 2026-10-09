import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle2, FileCheck2, ShieldCheck, UserRound, CalendarDays, MapPin } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import PhoneInput from '../components/PhoneInput';
import { getCountryCallingCode } from 'libphonenumber-js/max';
import '../guestCheckin.css';
import { property } from '../../../config/property';
import DocumentPreview from '../components/DocumentPreview';
import ImageCropDialog from '../components/ImageCropDialog';
import PhotoUploadCard from '../components/PhotoUploadCard';
import { validateGuestDetails, guestFieldErrors, propertyToday } from '../utils/guestCheckinValidation';
import { client, openInvitation, openPublicCheckin, guestError, compressIdentityImage, submitGuestCheckin } from '../services/guestCheckinService';

const initial = { full_name: '', email: '', phone: '', phone_country: 'IN', arrival_date: '', departure_date: '', coming_from: '', going_to: '', foreign_guest: false };

export default function GuestCheckinPage() {
  const location = useLocation();
  const token = new URLSearchParams(location.hash.slice(1)).get('invite') || new URLSearchParams(location.search).get('invite') || '';
  const [invitation, setInvitation] = useState(null);
  const [details, setDetails] = useState(initial);
  const [photos, setPhotos] = useState({});
  const [originals, setOriginals] = useState({});
  const [cropDraft, setCropDraft] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState({});
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({});
  const [today, setToday] = useState(propertyToday);
  const fieldErrors = guestFieldErrors(details, today);
  const versions = useRef({ front: 0, back: 0 });

  useEffect(() => {
    let active = true;
    setInvitation(null); setDetails(initial); setError('');
    setReviewing(false); setConfirmed(false); setTouched({});
    setPhotos({}); setProcessing({}); setOriginals({}); setCropDraft(null);
    versions.current.front++; versions.current.back++;
    if (!clientAvailable()) return;
    setBusy(true);
    (token ? openInvitation(token) : openPublicCheckin()).then(row => {
      if (active) {
        setInvitation(row);
        setDetails(previous => ({ ...previous, email: row.email || '' }));
      }
    }).catch(err => { if (active) setError(guestError(err)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    const refresh = () => setToday(propertyToday());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  function liveProps(name) {
    return { error: touched[name] ? fieldErrors[name] : undefined,
      'aria-invalid': !!(touched[name] && fieldErrors[name]),
      onBlur: () => setTouched(previous => ({ ...previous, [name]: true })) };
  }

  function choosePhoto(side, file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG or WebP photo.'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Each original photo must be 10 MB or smaller.'); return;
    }
    setError(''); setCropDraft({ side, file });
  }

  async function applyCrop(crop) {
    const { side, file } = cropDraft;
    const version = ++versions.current[side];
    setProcessing(previous => ({ ...previous, [side]: true })); setError('');
    try {
      const blob = await compressIdentityImage(file, crop);
      if (versions.current[side] === version) {
        setPhotos(previous => ({ ...previous, [side]: blob }));
        setOriginals(previous => ({ ...previous, [side]: file }));
        setCropDraft(null);
      }
    } catch (err) {
      if (versions.current[side] === version) setError(guestError(err));
    } finally {
      if (versions.current[side] === version) setProcessing(previous => ({ ...previous, [side]: false }));
    }
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setTouched(Object.fromEntries(Object.keys(details).map(key => [key, true])));
    try {
      const invalid = guestFieldErrors(details, propertyToday());
      if (Object.keys(invalid).length) {
        const name = Object.keys(invalid)[0];
        const input = event.currentTarget.querySelector('[name="' + name + '"]');
        input?.focus(); input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      const cleaned = validateGuestDetails(details, propertyToday());
      if (cropDraft || processing.front || processing.back || !photos.front || !photos.back) {
        throw new Error('Please choose both document photos and wait for compression.');
      }
      if (!reviewing) {
        setDetails({ ...cleaned, phone_country: details.phone_country }); setConfirmed(false); setReviewing(true);
        return;
      }
      if (!confirmed) throw new Error('Please confirm that your details and documents are correct.');
      if (busy) return;
      setBusy(true);
      const row = await submitGuestCheckin(invitation, cleaned, photos);
      setInvitation(row); setPhotos({}); setOriginals({}); setReviewing(false);
    } catch (err) { setError(guestError(err)); }
    finally { setBusy(false); }
  }

  const update = event => {
    const { name, value } = event.target;
    setDetails(previous => ({ ...previous, [name]: value }));
  };
  const completed = invitation?.status === 'completed';
  return (
    <main className="guest-modern min-h-[100dvh] bg-slate-50 px-3 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-12">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-5 flex items-center justify-between px-1">
          <div className="flex items-center gap-3"><img src={property.logo} alt={property.name} className="h-20 w-20 rounded-2xl object-contain sm:h-24 sm:w-24" />
            <div><span className="text-lg font-bold tracking-tight text-slate-900">{property.name}</span><p className="text-xs text-slate-500">{property.description}</p></div></div>
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500"><ShieldCheck size={15} />Guest check-in</span>
        </header>
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-5 py-6 sm:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{completed ? 'Check-in submitted' : reviewing ? 'Review your check-in' : 'Welcome to ' + property.name}</h1>
          <p className="mt-2 text-sm text-slate-500">Complete your details and add clear ID photos for a smooth arrival.</p>
          <ol className="mt-6 flex items-center gap-3 text-xs sm:gap-5 sm:text-sm" aria-label="Check-in progress">
            {['Details & ID', 'Review', 'Submitted'].map((step, index) => {
              const current = completed ? 2 : reviewing ? 1 : 0;
              return <li key={step} aria-current={index === current ? 'step' : undefined} className={'flex items-center gap-2 ' + (index <= current ? 'text-white' : 'text-slate-500')}>
                <span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs ' + (index <= current ? 'border-white bg-white text-slate-900' : 'border-slate-600')}>{index < current ? <CheckCircle2 size={15} /> : index + 1}</span>
                <span>{step}</span>
              </li>;
            })}
          </ol>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {!clientAvailable() ? <p className="text-sm text-slate-600">Guest check-in is not configured. Please contact reception.</p> :
            completed ? <div role="status" className="rounded-lg bg-emerald-50 p-5 text-emerald-800"><CheckCircle2 className="mb-2" /><h2 className="font-semibold">Already uploaded</h2><p className="mt-1 text-sm">Your details and documents have been submitted. Contact reception if a correction is needed.</p></div> :
            !invitation ? <div role="status" className="text-sm text-slate-600">
              {busy ? 'Getting your check-in ready...' : 'Unable to open check-in. Please contact the manager.'}
            </div> :
            reviewing ? <form onSubmit={submit} noValidate className="space-y-6">
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
                <input type="checkbox" required checked={confirmed} disabled={busy} className="mt-0.5 h-5 w-5 shrink-0 accent-slate-900"
                  onChange={event => setConfirmed(event.target.checked)} />
                I confirm that my details are correct and both document photos are readable.
              </label>
              <div className="flex flex-col-reverse gap-3 sm:flex-row">
                <Button className="min-h-12 rounded-xl sm:flex-1" type="button" variant="secondary" disabled={busy} onClick={() => {
                  setReviewing(false); setConfirmed(false); setError('');
                }}>Edit details / photos</Button>
                <Button className="min-h-12 rounded-xl disabled:opacity-40 sm:flex-1" disabled={busy || !confirmed}>{busy ? 'Uploading...' : 'Confirm and upload'}</Button>
              </div>
              <p className="text-xs text-slate-500">After submission, contact reception to arrange any corrections.</p>
            </form> :
            <form onSubmit={submit} noValidate className="space-y-6">
              <fieldset disabled={busy} className="space-y-6">
<section className="rounded-2xl border border-slate-200 p-4 sm:p-5"><h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900"><UserRound size={18} />Personal information</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Input className="min-h-12 min-w-0 !text-base sm:!text-sm" label="Full name" name="full_name" {...liveProps("full_name")} autoComplete="name" required maxLength={100} value={details.full_name} onChange={update} />
<PhoneInput country={details.phone_country} value={details.phone} error={touched.phone ? fieldErrors.phone : undefined}
                      onBlur={() => setTouched(previous => ({ ...previous, phone: true }))}
                      onChange={phone => setDetails(previous => ({ ...previous, phone }))}
                      onCountryChange={(country, national) => {
                        setDetails(previous => ({ ...previous, phone_country: country, phone: '+' + getCountryCallingCode(country) + national }));
                        setTouched(previous => ({ ...previous, phone: true }));
                      }} />
<Input className="min-h-12 min-w-0 !text-base sm:!text-sm" label="Email" name="email" {...liveProps("email")} type="email" autoComplete="email" required maxLength={254} value={details.email} onChange={update} /></div></section>
<section className="rounded-2xl border border-slate-200 p-4 sm:p-5"><h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900"><CalendarDays size={18} />Stay dates</h2><div className="grid gap-4 sm:grid-cols-2"><Input className="min-h-12 min-w-0 !text-base sm:!text-sm" label="Date of arrival" name="arrival_date" {...liveProps("arrival_date")} type="date" min={today} required value={details.arrival_date} onChange={update} />
<Input className="min-h-12 min-w-0 !text-base sm:!text-sm" label="Departure date" name="departure_date" {...liveProps("departure_date")} type="date" min={details.arrival_date && details.arrival_date > today ? details.arrival_date : today} required value={details.departure_date} onChange={update} /></div></section>
<section className="rounded-2xl border border-slate-200 p-4 sm:p-5"><h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900"><MapPin size={18} />Travel information</h2><div className="mb-4 grid gap-4 sm:grid-cols-2"><Input className="min-h-12 min-w-0 !text-base sm:!text-sm" label="Coming from" name="coming_from" {...liveProps("coming_from")} required maxLength={150} value={details.coming_from} onChange={update} /><Input className="min-h-12 min-w-0 !text-base sm:!text-sm" label="Going to" name="going_to" {...liveProps("going_to")} required maxLength={150} value={details.going_to} onChange={update} /></div>
                <label className="flex min-h-14 items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700"><input className="h-5 w-5 shrink-0 accent-slate-900" type="checkbox" checked={details.foreign_guest} onChange={event => {
                  setDetails(previous => ({ ...previous, foreign_guest: event.target.checked }));
                  versions.current.front++; versions.current.back++;
                  setPhotos({}); setProcessing({}); setOriginals({}); setCropDraft(null);
                }} />I am a foreign guest (passport and visa required)</label>
                </section>
                <section className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><FileCheck2 size={20} />Identity documents</h2>
                  <p className="mb-4 mt-1 text-sm text-slate-500">Choose a clear photo, then crop out the background.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {['front', 'back'].map(side => <PhotoUploadCard key={side} side={side}
                      label={details.foreign_guest ? (side === 'front' ? 'Passport front' : 'Visa') : (side === 'front' ? 'ID front side' : 'ID back side')}
                      photo={photos[side]} processing={processing[side]} disabled={busy || !!cropDraft}
                      onChoose={choosePhoto} onCrop={side => setCropDraft({ side, file: originals[side] })} />)}
                  </div>
                </section>
                <p className="text-xs text-slate-500">Your photos are cropped and optimized before upload. Review the final images to ensure all ID details remain readable.</p>
                <Button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl disabled:opacity-40" disabled={busy || !!cropDraft || processing.front || processing.back}>{busy ? 'Please wait...' : 'Review details and photos'}<ArrowRight size={17} /></Button>
              </fieldset>
            </form>}
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400"><ShieldCheck size={14} />Documents are stored privately for your check-in.</p>
      </div>
      {cropDraft && <ImageCropDialog key={cropDraft.side} file={cropDraft.file}
        label={details.foreign_guest ? (cropDraft.side === 'front' ? 'Passport front' : 'Visa') : (cropDraft.side === 'front' ? 'ID front side' : 'ID back side')}
        busy={!!processing[cropDraft.side]} error={error} onApply={applyCrop} onCancel={() => setCropDraft(null)} />}
    </main>
  );
}

function clientAvailable() {
  try { client(); return true; } catch { return false; }
}
