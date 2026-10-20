export const identityTypes=[['AADHAAR','Aadhaar'],['DRIVING_LICENSE','Driving licence'],['VOTER_ID','Voter ID'],['PASSPORT','Passport']];
export function identityPolicy(details={}){
 let type=String(details.document_type||(details.foreign_guest?'PASSPORT':'AADHAAR')).trim().toUpperCase().replace(/[\s-]+/g,'_');
 if(['DL','LICENCE','LICENSE','DRIVING_LICENCE'].includes(type))type='DRIVING_LICENSE';
 if(type==='PAN'||type==='PAN_CARD'||type==='PANCARD')throw new Error('PAN cards are not accepted. Choose Aadhaar, a driving licence, voter ID or passport.');
 if(!identityTypes.some(([value])=>value===type))throw new Error('Choose an accepted identity document.');
 if(details.foreign_guest&&type!=='PASSPORT')throw new Error('Foreign guests must upload a passport and visa.');
 return {type,label:identityTypes.find(([value])=>value===type)[1],required:!details.foreign_guest&&type==='DRIVING_LICENSE'?['front']:['front','back']};
}
export function identityUploadSides(details,photos={}){
 const policy=identityPolicy(details);
 return ['front','back'].filter(side=>policy.required.includes(side)||photos[side]);
}
