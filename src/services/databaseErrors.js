export function databaseError(error) {
 const message=error?.message||'Unable to save. Please try again.';
 if(error?.code==='23P01')return 'This bed is occupied or under maintenance for the selected dates. Refresh and choose another bed.';
 // Preserve the actual failed object instead of directing every schema error
 // to the original setup migrations, which may already be installed.
 if(['42P01','42703','42883','PGRST200','PGRST202','PGRST205'].includes(error?.code)||/schema cache|does not exist/i.test(message)){
  return `Database update required${error?.code?' ('+error.code+')':''}: ${message}`;
 }
 return message;
}
