import React, {useEffect, useRef} from 'react';

export default function PricingConfirmation({changes, onCancel, onConfirm}) {
  const dialog = useRef(null), cancelButton = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    cancelButton.current?.focus();
    return () => { if (element.open) element.close(); };
  }, []);
  return <dialog ref={dialog} aria-label="Confirm pricing update" onCancel={event => {event.preventDefault(); onCancel();}}
    className="w-[calc(100%_-_2rem)] max-w-xl rounded-xl border border-slate-300 bg-white text-slate-900 p-6 shadow-xl backdrop:bg-black/50">
    <h2 className="text-lg font-semibold">Confirm pricing update</h2>
    <p className="mt-2">{changes.length ? `${changes.length} room or bed prices will change.` : 'No prices have changed. Confirm to save and retry sync.'} Existing reservation totals stay unchanged.</p>
    <p className="mt-2">If Aiosell is enabled, saving will immediately attempt to publish the mapped rates.</p>
    {changes.length > 0 && <div className="mt-4 max-h-[45vh] overflow-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Room / bed</th><th>Current INR</th><th>New INR</th></tr></thead><tbody>{changes.map(change => <tr key={change.unitId}><td>{change.name}</td><td className="text-center">{(change.before / 100).toFixed(2)}</td><td className="text-center">{(change.after / 100).toFixed(2)}</td></tr>)}</tbody></table></div>}
    <div className="mt-5 flex flex-wrap justify-end gap-3"><button ref={cancelButton} type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="primary" onClick={onConfirm}>Confirm and save</button></div>
  </dialog>;
}
