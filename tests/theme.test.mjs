import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {resolveTheme,readThemePreference,applyTheme,THEME_STORAGE_KEY} from '../src/theme/theme.js';
test('saved light/dark choice overrides the system and invalid preferences follow the system',()=>{
 assert.equal(resolveTheme('light',true),'light');assert.equal(resolveTheme('dark',false),'dark');assert.equal(resolveTheme(null,true),'dark');assert.equal(resolveTheme('unknown',false),'light');
});
test('unavailable browser storage does not break theme preference loading',()=>{
 assert.equal(readThemePreference({getItem:()=>{throw new Error('blocked');}}),null);
 assert.equal(readThemePreference({getItem:key=>key===THEME_STORAGE_KEY?'dark':null}),'dark');
});
test('theme application updates native controls and browser chrome',()=>{
 const root={dataset:{},style:{}},meta={setAttribute:(key,value)=>meta[key]=value};applyTheme('dark',{documentElement:root,querySelector:()=>meta});
 assert.equal(root.dataset.theme,'dark');assert.equal(root.style.colorScheme,'dark');assert.equal(meta.content,'#0d1422');
});
test('early page bootstrap matches preferences even when storage is blocked',async()=>{
 const script=await readFile(new URL('../public/theme-init.js',import.meta.url),'utf8');
 for(const [saved,system,expected] of [['light',true,'light'],['dark',false,'dark'],[null,true,'dark'],['blocked',false,'light'],['invalid',true,'dark']]){
  const root={dataset:{},style:{}};runInNewContext(script,{document:{documentElement:root,querySelector:()=>null},localStorage:{getItem:()=>{if(saved==='blocked')throw new Error('blocked');return saved;}},window:{matchMedia:()=>({matches:system})}});assert.equal(root.dataset.theme,expected);
 }
});
test('generated palette defines every referenced token in light, dark and print modes',async()=>{
 const palette=await readFile(new URL('../src/theme/palette.css',import.meta.url),'utf8');
 const definitions=[...palette.matchAll(/(--theme-[\w-]+):/g)].map(m=>m[1]);
 const utilities=await readFile(new URL('../src/theme/utilities.css',import.meta.url),'utf8');
 for(const match of utilities.matchAll(/var\((--theme-[\w-]+)/g))assert.equal(definitions.filter(key=>key===match[1]).length,3,match[1]);
 assert.match(palette,/@media print/);assert.match(palette,/:root\[data-theme="dark"\]/);
});
