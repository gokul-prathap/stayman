// UI routing only. Database policies independently enforce the signed JWT claims.
export function hasOtpSession(session) {
 try {
  const payload=session?.access_token?.split('.')[1];
  if(!payload)return false;
  const claims=JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
  return claims.is_anonymous!==true&&Array.isArray(claims.amr)&&claims.amr.some(item=>item.method==='otp');
 }catch{return false;}
}
