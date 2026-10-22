// A failed channel attempt must never turn a successful local save into a failed save.
export async function syncSavedPricing(client, propertyId) {
  try {
    const {data, error} = await client.functions.invoke('aiosell-sync', {body: {property: propertyId, action: 'sync'}});
    let response = data;
    if (error) {
      try { response = await error.context?.json(); } catch { /* Network failures may have no JSON response. */ }
    }
    const rate = response?.results?.rates;
    if (rate?.status === 'sent') return {state: 'sent', message: 'Aiosell rates sent.'};
    if (rate?.status === 'failed') return {state: 'failed', message: `Aiosell rates need attention: ${rate.message}`};
    if (error || response?.error) return {state: 'failed', message: 'Aiosell sync could not be confirmed. Prices remain saved and queued for retry.'};
    return {state: 'pending', message: 'Aiosell rates are queued; another sync may be running. Status will refresh here.'};
  } catch {
    return {state: 'failed', message: 'Aiosell sync could not be confirmed. Prices remain saved and queued for retry.'};
  }
}
