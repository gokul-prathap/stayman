import {db} from './stayman';
export async function adminRpc(name,args) {
 const {data,error}=await db().rpc(name,args);
 if(error)throw error;
 return data;
}
export function propertyLogo(path) {
 return path?db().storage.from('property-logos').getPublicUrl(path).data.publicUrl:null;
}
export async function uploadPropertyLogo(id,file) {
 const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
 if(!extensions[file.type]||file.size>2*1024*1024)throw new Error('Choose a PNG, JPEG or WebP logo up to 2 MB.');
 const path=id+'/'+crypto.randomUUID()+'.'+extensions[file.type];
 const bucket=db().storage.from('property-logos');
 const {error}=await bucket.upload(path,file,{contentType:file.type});
 if(error)throw error;
 try {await adminRpc('stayman_admin_set_logo',{p_property:id,p_path:path});}
 catch(err){await bucket.remove([path]);throw err;}
}
