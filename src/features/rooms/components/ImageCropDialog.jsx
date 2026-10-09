import { useEffect, useRef, useState } from 'react';
import { Crop, RotateCcw, X } from 'lucide-react';
import Button from '../../../components/ui/Button';

const full = { x: 0, y: 0, width: 1, height: 1 };
const clamp = value => Math.max(0, Math.min(1, value));

export default function ImageCropDialog({ file, label, busy, error, onApply, onCancel }) {
  const [url, setUrl] = useState('');
  const [crop, setCrop] = useState(full);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const stage = useRef(null);
  const start = useRef(null);
  const dialog = useRef(null);
  const close = useRef(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl); setCrop(full); setLoaded(false); setFailed(false);
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    return () => {
      URL.revokeObjectURL(objectUrl);
      document.body.style.overflow = overflow;
      previousFocus?.focus?.();
    };
  }, [file]);

  function point(event) {
    const bounds = stage.current.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width),
      y: clamp((event.clientY - bounds.top) / bounds.height) };
  }
  function move(event) {
    if (!start.current || busy) return;
    const next = point(event), first = start.current;
    const x = Math.min(first.x, next.x), y = Math.min(first.y, next.y);
    const width = Math.abs(next.x - first.x), height = Math.abs(next.y - first.y);
    if (width >= 0.03 && height >= 0.03) setCrop({ x, y, width, height });
  }
  function keyDown(event) {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel(); }
    if (event.key !== 'Tab') return;
    const items = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  function marginChange(edge, value) {
    const next = Number(value) / 100;
    setCrop(previous => {
      const right = previous.x + previous.width, bottom = previous.y + previous.height;
      if (edge === 'left') { const x = Math.min(next, right - 0.03); return { ...previous, x, width: right - x }; }
      if (edge === 'top') { const y = Math.min(next, bottom - 0.03); return { ...previous, y, height: bottom - y }; }
      if (edge === 'right') return { ...previous, width: Math.max(0.03, 1 - next - previous.x) };
      return { ...previous, height: Math.max(0.03, 1 - next - previous.y) };
    });
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="crop-title" onKeyDown={keyDown}
        className="max-h-[100dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-h-[90dvh] sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
            <h2 id="crop-title" className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-900"><Crop size={20} />Crop your photo</h2></div>
          <button ref={close} type="button" disabled={busy} onClick={onCancel} aria-label="Close crop editor"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600 disabled:opacity-40"><X size={20} /></button>
        </div>
        <p className="mb-4 mt-3 text-sm text-slate-500">Drag across the photo to select your ID. Keep the name, photo and document number inside the frame.</p>
        <div className="flex min-h-32 items-center justify-center overflow-hidden rounded-xl bg-slate-900">
          <div ref={stage} className="relative max-w-full touch-none select-none"
            onPointerDown={event => {
              if (!loaded || busy) return;
              event.preventDefault(); start.current = point(event); event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={move} onPointerUp={event => { move(event); start.current = null; }}
            onPointerCancel={() => { start.current = null; }}>
            {url && <img src={url} alt={label + ' original photo'} draggable="false" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
              className="max-h-[38dvh] max-w-full object-contain" />}
            {loaded && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-white"
              style={{ left: crop.x * 100 + '%', top: crop.y * 100 + '%', width: crop.width * 100 + '%', height: crop.height * 100 + '%', boxShadow: '0 0 0 9999px rgba(15,23,42,0.55)' }}>
              <div className="absolute inset-x-0 top-1/3 border-t border-white/40" /><div className="absolute inset-x-0 top-2/3 border-t border-white/40" />
              <div className="absolute inset-y-0 left-1/3 border-l border-white/40" /><div className="absolute inset-y-0 left-2/3 border-l border-white/40" />
            </div>}
          </div>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {failed && <p role="alert" className="mt-3 text-sm text-red-600">This photo cannot be opened. Choose another JPEG, PNG or WebP.</p>}
        <details className="mt-4 rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Fine-tune the crop</summary>
          <div className="mt-3 grid grid-cols-2 gap-4">
            {[['left', crop.x], ['top', crop.y], ['right', 1 - crop.x - crop.width], ['bottom', 1 - crop.y - crop.height]].map(([edge, value]) => (
              <label key={edge} className="text-xs capitalize text-slate-500">{edge} margin
                <input type="range" min="0" max="97" step="0.5" value={Math.max(0, value * 100)} disabled={busy || !loaded}
                  onChange={event => marginChange(edge, event.target.value)} className="mt-2 block w-full accent-slate-900" />
              </label>
            ))}
          </div>
        </details>
        <div className="mt-5 flex gap-3 pb-[env(safe-area-inset-bottom)]">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => setCrop(full)} className="flex min-h-12 items-center gap-2"><RotateCcw size={16} />Reset</Button>
          <Button type="button" disabled={busy || !loaded || failed} onClick={() => onApply(crop)}
            className="min-h-12 flex-1 disabled:opacity-40">{busy ? 'Preparing photo...' : 'Use cropped photo'}</Button>
        </div>
      </div>
    </div>
  );
}
