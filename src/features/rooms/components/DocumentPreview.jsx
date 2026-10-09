import { useEffect, useState } from 'react';

export default function DocumentPreview({ blob, label }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  if (!blob || !url) return null;
  return (
    <figure className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <img src={url} alt={label} className="max-h-72 w-full rounded object-contain" />
      <figcaption className="mt-2 text-xs text-slate-600">{label} · {Math.ceil(blob.size / 1024)} KB</figcaption>
    </figure>
  );
}
