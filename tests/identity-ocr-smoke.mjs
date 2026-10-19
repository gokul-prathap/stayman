// Optional integration check: requires Python/Pillow and downloads English OCR data.
// Uses synthetic text only, never a real person's identity document.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createWorker,PSM} from 'tesseract.js';
import {documentTextResult} from '../src/features/rooms/utils/identityScreening.js';

const directory=mkdtempSync(join(tmpdir(),'stayman-ocr-smoke-'));
execFileSync('python',['-c',`
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',38)
samples={
 'document':'GOVERNMENT OF INDIA\\nAADHAAR - TEST SAMPLE\\nName: SAMPLE PERSON\\nDOB: 01/01/1990\\nSex: FEMALE\\n1234 5678 9012',
 'receipt':'COFFEE SHOP RECEIPT\\nCoffee and sandwiches\\nTotal: 250.00\\nThank you for visiting'
}
for name,text in samples.items():
 image=Image.new('RGB',(1200,650),'white')
 ImageDraw.Draw(image).multiline_text((65,55),text,font=font,fill='black',spacing=24)
 image.save(Path(sys.argv[1])/(name+'.png'))
`,directory]);
const worker=await createWorker('eng',1,{cachePath:directory,logger:()=>{}});
try {
 await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
 for(const [name,expected] of [['document',true],['receipt',false]]){
  const {data}=await worker.recognize(join(directory,name+'.png'),{rotateAuto:true});
  assert.equal(documentTextResult(data.text,{confidence:data.confidence}).accepted,expected,name);
  console.log(name+': '+(expected?'document text detected':'unrelated image rejected'));
 }
}finally{await worker.terminate();}
