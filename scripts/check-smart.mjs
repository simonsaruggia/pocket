// Explicit opt-in live checks: uses synthetic records only; never writes to Pocket.
import assert from 'node:assert/strict';
import {createDB} from '../tests/helpers.mjs';
import {smartPreview} from '../src/smart.js';
const env={DB:createDB(),OPENAI_API_KEY:process.env.OPENAI_API_KEY};
assert.ok(env.OPENAI_API_KEY,'OPENAI_API_KEY is required');
for(const tag of ['Monte Carlo','Roma','grecia',"Isola d'Elba"]){await env.DB.prepare('INSERT INTO tags VALUES (?,?,?)').bind('test',tag,'now').run();}
const cases=[
  ['18€ in monaco lunch',r=>{assert.equal(r.transactions[0].amount_cents,1800);assert.equal(r.transactions[0].category_id,'food-6');assert.deepEqual(r.transactions[0].tags,['Monte Carlo']);}],
  ['ieri 75,50 euro Airbnb in Grecia',r=>{assert.equal(r.transactions[0].amount_cents,7550);assert.equal(r.transactions[0].category_id,'essentials-6');assert.equal(r.transactions[0].occurred_on,'2026-11-06');assert.deepEqual(r.transactions[0].tags,['grecia']);}],
  ['24 euro spesa supermercato e 10 euro noleggio scooter, Isola d Elba, il 12 agosto 2026',r=>{assert.equal(r.transactions.length,2);assert.equal(r.transactions[0].category_id,'food-5');assert.equal(r.transactions[1].category_id,'transportation-8');assert.ok(r.transactions.every(t=>t.occurred_on==='2026-08-12'&&t.tags[0]==="Isola d'Elba"));}],
  ['Lunch in Rome',r=>{assert.ok(r.question);assert.equal(r.transactions.length,0);}],
  ['Dinner €80 split equally between four, only my share, no tag',r=>{assert.equal(r.transactions[0].amount_cents,2000);assert.deepEqual(r.transactions[0].tags,[]);}]
];
for(const [text,check] of cases){
  const request=new Request('https://test.local/api/expenses/preview',{method:'POST',body:JSON.stringify({text,date:'2026-11-07',default_tag:''})});
  const result=await smartPreview(request,env,'test','2026-11-07');
  if(result.status!==200){console.log(JSON.stringify({status:result.status,error:result.data.error}));process.exit(1);}
  check(result.data);console.log('Passed: '+text);
}
assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
console.log('Live checks passed; no expenses saved.');
