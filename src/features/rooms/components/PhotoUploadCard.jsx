import { Camera, Crop, ImagePlus, LoaderCircle } from 'lucide-react';
import DocumentPreview from './DocumentPreview';

export default function PhotoUploadCard({ side, label, photo, processing, disabled, onChoose, onCrop }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center gap-2"><div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Camera size={18} /></div>
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
      </div>
      {photo && <DocumentPreview blob={photo} label={label} />}
      <div className="mt-3 flex gap-2">
        <label className={'relative flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-sm font-medium text-slate-600 focus-within:ring-2 focus-within:ring-slate-400 ' + (disabled ? 'opacity-40' : 'hover:bg-slate-100')}>
          {processing ? <LoaderCircle size={18} className="animate-spin" /> : <ImagePlus size={18} />}
          {processing ? 'Preparing...' : photo ? 'Replace photo' : 'Choose photo'}
          <input type="file" aria-label={'Choose ' + label} accept="image/jpeg,image/png,image/webp" disabled={disabled}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onChoose(side, file); }} />
        </label>
        {photo && <button type="button" onClick={() => onCrop(side)} disabled={disabled}
          className="flex min-h-12 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 disabled:opacity-40">
          <Crop size={16} />Crop
        </button>}
      </div>
      <p className="mt-2 text-xs text-slate-400">JPEG, PNG or WebP · up to 10 MB</p>
    </div>
  );
}
