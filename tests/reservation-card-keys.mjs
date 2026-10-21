// Check the actual reservation element tree without staff credentials or database writes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import React from 'react';
import {transform} from 'esbuild';
const source=await readFile(new URL('../src/features/reservations/components/ReservationDetails.jsx',import.meta.url),'utf8');
const dependencies={React,useEffect:()=>{},useRef:()=>({current:null}),useState:initial=>[initial,()=>{}],
 useStaff:()=>({property:{timezone:'Asia/Kolkata'}}),
 usePropertyData:()=>({refresh:()=>{},data:{reservations:[{id:'booking-1',status:'PENDING',guest_id:'guest-1',check_in_date:'2026-10-21',check_out_date:'2026-10-25',total_amount:10000,paid_amount:0}],guests:[{id:'guest-1',full_name:'Sample guest'}],members:[],payments:[],units:[],allocations:[]}}),
 dayInZone:()=> '2026-10-21',refundSummary:()=>({pending:0,done:0}),money:()=> 'INR 100'};
for(const match of source.matchAll(/^import (.+?) from .+;$/gm)){
 const names=match[1].replace(/[{}]/g,'').split(',').map(value=>value.trim());
 for(const name of names)if(!(name in dependencies))dependencies[name]=()=>null;
}
const code=source.replace(/^import .*;\r?\n/gm,'').replace('export default function ReservationDetails','function ReservationDetails');
// Transform as a module, then return the component from an isolated fixture scope.
const result=await transform(code,{loader:'jsx'});
const render=new Function(...Object.keys(dependencies),result.code+'\nreturn ReservationDetails;')(...Object.values(dependencies));
for(let update=0;update<5;update++){
 const tree=render({reservationId:'booking-1'});
 const verify=node=>{
  if(!React.isValidElement(node))return;
  const children=React.Children.toArray(node.props.children);
  const keys=children.filter(React.isValidElement).map(child=>child.key);
  assert.equal(new Set(keys).size,keys.length,'Sibling reservation sections must have unique keys across refreshes');
  for(const child of children)verify(child);
 };
 verify(tree);
}
console.log('PASS reservation cards have unique sibling identities across repeated data renders');
