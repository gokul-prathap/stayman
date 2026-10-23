export function bookingStatus(reservation){return reservation?.closure_kind==='NO_SHOW'?'No-show':(reservation?.status||'').replaceAll('_',' ');}
