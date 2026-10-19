// Structural rendering check without a connected property or database writes.
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {stayDays} from '../src/features/allocation/utils/stayView.js';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
try{
 const {default:StayChart}=await server.ssrLoadModule('/src/features/allocation/components/StayChart.jsx');
 const data={units:[{id:'a',label:'Bed 1',roomName:'Sample Dorm',type:'BED'}],allocations:[],reservations:[]};
 const html=renderToStaticMarkup(React.createElement(StayChart,{data,days:stayDays('2026-10-19'),today:'2026-10-19'}));
 assert.match(html,/Collapse Sample Dorm/);assert.match(html,/aria-expanded="true"/);
 assert.match(html,/Occupancy/);assert.match(html,/0%/);assert.match(html,/All rooms &amp; dorms/);
 assert.equal((html.match(/scope="col"/g)||[]).length,15);
 const blocked={...data,allocations:[{id:'block',unitId:'a',status:'MAINTENANCE',reason:'Painting',checkInDate:'2026-10-19',checkOutDate:'2026-10-21'}]};
 const blockHtml=renderToStaticMarkup(React.createElement(StayChart,{data:blocked,days:stayDays('2026-10-19'),today:'2026-10-19'}));
 assert.match(blockHtml,/stay-pill blocked/);assert.match(blockHtml,/Blocked · Painting/);assert.match(blockHtml,/1 blocked \/ held/);
 const empty=renderToStaticMarkup(React.createElement(StayChart,{data:{units:[],allocations:[],reservations:[]},days:stayDays('2026-10-19',7),today:'2026-10-19'}));
 assert.match(empty,/No matching inventory/);assert.doesNotMatch(empty,/NaN/);
 console.log('Stay View rendering passed: 14 date columns, expanded groups, visible maintenance, occupancy and empty inventory.');
}finally{await server.close();}
