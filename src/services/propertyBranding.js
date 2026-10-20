export function propertyInitials(name){return String(name||'Property').trim().split(/\s+/).slice(0,2).map(word=>word.charAt(0)).join('').toUpperCase()||'P';}
export function socialURL(value,platform){
 try{const url=new URL(value);const hosts=platform==='instagram'?['instagram.com','www.instagram.com']:['facebook.com','www.facebook.com','fb.com','www.fb.com'];return url.protocol==='https:'&&hosts.includes(url.hostname)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
export function propertyBranding(record){
 return {...record,name:String(record?.name||'Guest check-in').trim(),tagline:record?.tagline||'',logo_path:record?.logo_path||'',instagram_url:socialURL(record?.instagram_url,'instagram'),facebook_url:socialURL(record?.facebook_url,'facebook'),whatsapp_number:/^\+[1-9]\d{6,14}$/.test(record?.whatsapp_number||'')?record.whatsapp_number:''};
}
export function instagramHandle(value){try{const handle=new URL(value).pathname.split('/').filter(Boolean)[0];return handle?'@'+handle:'Instagram';}catch{return '';}}
export function instagramProfile(value){const text=String(value||'').trim();if(/^@?[A-Za-z0-9_.]+$/.test(text))return 'https://www.instagram.com/'+text.replace(/^@/,'')+'/';try{const url=new URL(text);if(socialURL(text,'instagram')&&/^\/[A-Za-z0-9_.]+\/?$/.test(url.pathname))return 'https://www.instagram.com/'+url.pathname.split('/').filter(Boolean)[0]+'/';}catch{/* Server validation explains invalid URLs. */}return text;}
