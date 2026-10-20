// A document-likeness check, not identity verification or fraud detection.
// Keep OCR text in memory only; do not log or persist document numbers.
export function documentTextResult(text,{side='front',foreign=false,confidence=100}={}) {
 const value=String(text||'').toUpperCase().replace(/[^A-Z0-9<\n /:.-]/g,' ');
 const letters=(value.match(/[A-Z]/g)||[]).length;
 if(/INCOME TAX DEPARTMENT|PERMANENT ACCOUNT NUMBER|\bPAN CARD\b/.test(value))return {accepted:false,reason:'pan-not-accepted'};
 if(confidence<30||letters<18)return {accepted:false,reason:'unreadable'};
 const aadhaar=/AADHAAR|AADHAR|UIDAI|UNIQUE IDENTIFICATION/.test(value);
 const passport=/PASSPORT|P<[A-Z]{3}/.test(value);
 const visa=/\bVISA\b|RESIDENCE PERMIT/.test(value);
 const driving=/DRIVING|DRIVER.?S? LICEN[CS]E|DRIVING LICEN[CS]E/.test(value);
 const voter=/ELECTION COMMISSION|ELECTOR|VOTER/.test(value);
 const identity=/IDENTITY CARD|IDENTIFICATION CARD|NATIONAL ID|GOVERNMENT OF INDIA|REPUBLIC OF INDIA/.test(value);
 const fields=[/\bNAME\b|SURNAME|GIVEN NAMES/,/BIRTH|\bDOB\b|\bYOB\b/,/ADDRESS|\bPIN\b/,/\bSEX\b|GENDER|NATIONALITY/,/EXPIR|VALID|ISSU/,/\d[\d /-]{5,}\d/].filter(pattern=>pattern.test(value)).length;
 let accepted;
 if(foreign)accepted=side==='front'?passport&&(fields>=1||/P<[A-Z]{3}/.test(value)):visa&&fields>=1;
 else if(side==='front')accepted=(aadhaar||passport||driving||voter||identity)&&fields>=2;
 else accepted=((aadhaar||passport||driving||voter||identity)&&fields>=1)||(/ADDRESS/.test(value)&&/\b\d{6}\b/.test(value)&&letters>=35);
 return {accepted:!!accepted,reason:accepted?'document-like':'not-document'};
}

const screened=new WeakMap();
const screeningKey=options=>(options.foreign?'foreign':'domestic')+':'+options.side;
export function photoScreening(blob){return blob?screened.get(blob)?.result:null;}
export function requestManualDocumentReview(blob,options) {
 const entry=screened.get(blob);
 if(!entry||entry.key!==screeningKey(options)||entry.result.accepted)throw new Error('Check the cropped photo before requesting reception review.');
 if(entry.result.reason==='pan-not-accepted')throw new Error('PAN cards are not accepted. Upload another identity document.');
 entry.result={...entry.result,manualReview:true};
 return entry.result;
}
export async function screenIdentityPhoto(blob,options={}) {
 const key=screeningKey(options);
 if(screened.get(blob)?.key===key)return screened.get(blob).result;
 let worker,timer,expired=false;
 let result={accepted:false,reason:'unavailable'};
 try {
  const {createWorker,PSM}=await import('tesseract.js');
  await Promise.race([(async()=>{
   worker=await createWorker('eng',1,{
    // Download engine assets only. The photo and extracted text stay on-device.
    logger:()=>{},errorHandler:()=>{},
   });
   if(expired){await worker.terminate();worker=null;throw new Error('Document checking timed out.');}
   await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
   const {data}=await worker.recognize(blob,{rotateAuto:true});
   result=documentTextResult(data.text,{...options,confidence:data.confidence});
  })(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Document checking timed out. Check your connection and retry, or contact reception.'));},60000);})]);
 }catch{result={accepted:false,reason:'unavailable'};}
 finally{clearTimeout(timer);if(worker)await worker.terminate().catch(()=>{});}
 screened.set(blob,{key,result});
 return result;
}
