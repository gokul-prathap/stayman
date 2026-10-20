// Migrate component colours to role-based tokens and regenerate Tailwind colour utilities.
// Run after adding fixed colours. Illustration artwork and print styles stay literal.
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import config from '../tailwind.config.js';
const tokens=new Map();
const colorPattern=/#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})\b|\b(?:rgba?|hsla?)\((?:[^()]|\([^()]*\))*\)|\b(?:white|black)\b/gi;
function decode(value){
 if(value==='white')return [255,255,255,1];if(value==='black')return [0,0,0,1];
 if(value[0]==='#'){let hex=value.slice(1);if(hex.length<5)hex=hex.split('').map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)).concat(hex.length===8?parseInt(hex.slice(6),16)/255:1);}
 const plain=value.replace(/var\([^)]*\)/g,'1'),numbers=plain.match(/[\d.]+%?/g);
 if(!numbers||numbers.length<3)return null;
 if(value.startsWith('hsl'))return null;
 return numbers.slice(0,3).map(n=>parseFloat(n)*(n.endsWith('%')?2.55:1)).concat(numbers[3]?parseFloat(numbers[3])/(numbers[3].endsWith('%')?100:1):1);
}
function hsl([red,green,blue]){const r=red/255,g=green/255,b=blue/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0;if(d){h=max===r?((g-b)/d+(g<b?6:0)):max===g?(b-r)/d+2:(r-g)/d+4;h/=6;}return [h*360,d?d/(1-Math.abs(2*l-1)):0,l];}
function dark(value,role){
 const rgba=decode(value);if(!rgba)return value;
 const [h,s,l]=hsl(rgba),a=rgba[3];let hue=h,saturation=s,light=l;
 if(role==='shadow')return `rgb(0 0 0 / ${Math.max(a,.12).toFixed(3)})`;
 if(role==='surface'){
  if(l>.79){hue=s>.18?h:220;saturation=s>.18?Math.min(s*.5,.44):.28;light=.12+(1-l)*.43;}
  else if(l>.55&&s<.3){hue=220;saturation=.22;light=.22;}
  // Saturated buttons retain their fill and white text; deep artwork stays deep.
 }else if(role==='border'){
  if(l>.7){hue=s>.25?h:220;saturation=s>.25?Math.min(s*.5,.45):.22;light=.26+(1-l)*.35;}
  else light=Math.max(l,.35);
 }else if(role==='text'){
  if(l>.93&&s<.25)return value; // white text on primary actions
  if(s<.36||(h>185&&h<265&&l<.45)){hue=218;saturation=.25;light=l<.3?.9:l<.58?.77:.67;}
  else light=Math.max(.7,Math.min(.84,l+.14));
 }
 return `hsl(${hue.toFixed(1)} ${(saturation*100).toFixed(1)}% ${(light*100).toFixed(1)}% / ${a.toFixed(3)})`;
}
function roleOf(property){
 if(property.includes('shadow'))return 'shadow';
 if(/background|gradient/.test(property))return 'surface';
 if(/border|outline|ring|line/.test(property))return 'border';
 return 'text';
}
function token(value,role){const key=`--theme-${role}-${createHash('sha1').update(value.toLowerCase()).digest('hex').slice(0,8)}`;let light=value.replace(/var\((--[\w-]+)\)/g,'var($1,1)');const rgba=decode(value.toLowerCase());if(role==='text'&&rgba){const [_h,s,l]=hsl(rgba);if(s<.4&&l>.42&&l<.88)light=`hsl(218 18% 42% / ${rgba[3].toFixed(3)})`;}tokens.set(key,{light,dark:dark(value.toLowerCase(),role)});return `var(${key},${value})`;}
function transformValue(value,role){
 const existing=[];
 // Protect already migrated values, collecting their original fallback for regeneration.
 value=value.replace(/var\((--theme-(text|surface|border|shadow)-[\da-f]+),((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g,(full,key,type,original)=>{token(original,type);existing.push(full);return `THEMECOLOR${existing.length-1}END`;});
 value=value.replace(colorPattern,match=>token(match,role));
 return value.replace(/THEMECOLOR(\d+)END/g,(_match,index)=>existing[Number(index)]);
}
async function files(dir){let result=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isDirectory())result.push(...await files(path));else result.push(path);}return result;}
const sourceFiles=await files('src');
for(const file of sourceFiles.filter(p=>p.endsWith('.css')&&!p.startsWith('src/theme/')&&!p.includes('/illustrations/'))){
 const root=postcss.parse(await readFile(file,'utf8'));
 root.walkDecls(declaration=>{let parent=declaration.parent;while(parent){if(parent.type==='atrule'&&parent.name==='media'&&parent.params.includes('print'))return;parent=parent.parent;}declaration.value=transformValue(declaration.value,roleOf(declaration.prop));});
 await writeFile(file,root.toString());
}
// Theme chart presentation attributes and inline colour style values, without changing QR pixels.
for(const file of sourceFiles.filter(p=>p.endsWith('.jsx')&&!p.includes('/illustrations/'))){
 let source=await readFile(file,'utf8');
 for(const match of source.matchAll(/var\((--theme-(text|surface|border|shadow)-[\da-f]+),((?:[^()]|\((?:[^()]|\([^()]*\))*\))*)\)/g))token(match[3],match[2]);
 source=source.replace(/\b(fill|stroke|stopColor)="(#[\da-f]{3,8}|white|black)"/gi,(_match,prop,color)=>`${prop}="${token(color,prop==='stroke'?'border':hsl(decode(color))[2]>.8?'surface':'text')}"`);
 source=source.replace(/borderColor:[^\n]+/g,expression=>expression.replace(/'(#[\da-f]{3,8})'/gi,(_match,color)=>`'${token(color,'border')}'`));
 await writeFile(file,source);
}
// Tailwind utilities have separate text/surface/border roles, including opacity, hover and responsive variants.
const generated=await postcss([tailwind(config)]).process('@tailwind utilities;',{from:'src/theme/generated-input.css'});
generated.root.walkDecls(declaration=>{const next=transformValue(declaration.value,roleOf(declaration.prop));if(next===declaration.value&&!next.includes('--theme-'))declaration.remove();else declaration.value=next;});
generated.root.walkRules(rule=>{if(!rule.nodes?.length)rule.remove();});
generated.root.walkAtRules(rule=>{if(!rule.nodes?.length)rule.remove();});
generated.root.walkComments(comment=>comment.remove());
await writeFile('src/theme/utilities.css','/* Generated by scripts/prepare-theme.mjs. */\n'+generated.root.toString());
const sorted=[...tokens].sort(([a],[b])=>a.localeCompare(b));
await writeFile('src/theme/palette.css','/* Generated role-based colour tokens. Run node scripts/prepare-theme.mjs to refresh. */\n:root{\n'+sorted.map(([key,v])=>` ${key}:${v.light};`).join('\n')+'\n}\n:root[data-theme="dark"]{\n'+sorted.map(([key,v])=>` ${key}:${v.dark};`).join('\n')+'\n}\n@media print{\n:root[data-theme]{\n'+sorted.map(([key,v])=>` ${key}:${v.light};`).join('\n')+'\n}\n}\n');
console.log(`Prepared ${tokens.size} colour tokens and themed Tailwind utilities.`);
