// Local synthetic SQL only; no production credentials or network calls.
import {createServer} from 'node:http';
import {expenseFixture} from './expense-fixture.mjs';
import {rpc,property} from './workspace-fixture.mjs';
let db=await expenseFixture();
async function seed(){
const today=(await db.query("select (now() at time zone 'Asia/Kolkata')::date::text as day")).rows[0].day;
await db.exec(`insert into stayman_expenses(property_id,category,description,vendor,amount_paise,expense_date,recorded_by,request_id)
select '${property}','SUPPLIES','Synthetic supply '||i,'QA',1000,('${today}'::date-interval '1 day')::date,'${property}',gen_random_uuid() from generate_series(1,30) i;`);
}
await seed();
let queue=Promise.resolve();
createServer((req,res)=>{
const work=async()=>{try{
 let input='';for await(const chunk of req)input+=chunk;const body=JSON.parse(input||'{}');
 res.setHeader('Content-Type','application/json');
 if(req.url==='/receipt'){await db.query("insert into storage.objects(id,bucket_id,name) values(gen_random_uuid(),'expense-receipts',$1)",[body.path]);res.end('{}');return;}
 if(req.url==='/reset'){await db.close();db=await expenseFixture();await seed();res.end('{}');return;}
 if(req.url==='/properties'){res.end(JSON.stringify((await db.query('select * from stayman_properties')).rows));return;}
 if(req.url==='/rpc'&&/^stayman_/.test(body.name)){res.end(JSON.stringify(await rpc(db,body.name,body.args)));return;}
 res.statusCode=404;res.end('{}');
}catch(e){res.statusCode=400;res.end(JSON.stringify({message:e.message}));}};
queue=queue.then(work,work);
}).listen(4175,'127.0.0.1',()=>console.log('Synthetic expense SQL ready on 127.0.0.1:4175'));
