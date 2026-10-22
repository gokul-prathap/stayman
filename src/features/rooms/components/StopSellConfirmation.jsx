import React, {useEffect, useRef} from 'react';

export default function StopSellConfirmation({roomCode, enabled, onCancel, onConfirm}) {
  const dialog = useRef(null), cancel = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal(); cancel.current?.focus();
    return () => {if (element.open) element.close();};
  }, []);
  return <dialog ref={dialog} className="aiosell-stop-dialog" aria-label="Confirm stop sell change" onCancel={event => {event.preventDefault(); onCancel();}}>
    <h2>{enabled ? 'Close category to new bookings?' : 'Reopen category for bookings?'}</h2>
    <p><strong>{roomCode || 'This room category'}</strong>: {enabled
      ? 'Stop sell closes all units in this mapping to new online bookings. Existing reservations are not cancelled or changed.'
      : 'Turning stop sell off allows available units in this mapping to be offered for new online bookings again.'}</p>
    <p>This confirmation changes your draft only. Click <strong>Save mappings</strong>, then <strong>Sync now</strong> to send it to Aiosell when the connection is enabled. Verify the result in Aiosell.</p>
    <div className="aiosell-stop-dialog-actions"><button ref={cancel} type="button" className="secondary" onClick={onCancel}>Cancel</button><button type="button" className="aiosell-stop-confirm" onClick={onConfirm}>{enabled ? 'Confirm stop sell' : 'Confirm reopening'}</button></div>
  </dialog>;
}
