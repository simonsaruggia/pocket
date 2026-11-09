import test from 'node:test';
import assert from 'node:assert/strict';
import {createDB} from './helpers.mjs';
import {smartPreview} from '../src/smart.js';
import worker from '../src/server.js';
const draft={currency:'EUR',amount_cents:1800,category_id:'food-6',occurred_on:'2026-11-07',note:'Lunch in Rome',tags:['roma']};
const body={text:'18€ lunch in Rome',date:'2026-11-07',default_tag:''};
const request=(data=body)=>new Request('https://pocket.test/api/expenses/preview',{method:'POST',body:JSON.stringify(data)});
const reply=(data)=>new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]}));
function environment(){return {DB:createDB(),OPENAI_API_KEY:'test-key-not-real'};}
test('smart preview uses private context, canonical tags, exact cents and never saves',async()=>{
  const env=environment();await env.DB.prepare('INSERT INTO tags VALUES (?,?,?)').bind('alice','Roma','now').run();await env.DB.prepare('INSERT INTO tags VALUES (?,?,?)').bind('bob','Secret trip','now').run();
  const result=await smartPreview(request(),env,'alice','2026-11-07',async(url,options)=>{
    assert.equal(url,'https://api.openai.com/v1/responses');const payload=JSON.parse(options.body);assert.equal(payload.store,false);assert.equal(payload.text.format.strict,true);
    const context=JSON.parse(payload.input);assert.deepEqual(context.existing_tags,['Roma']);assert.equal(context.expense_description,body.text);
    return reply({question:'',transactions:[draft]});
  });
  assert.equal(result.status,200);assert.equal(result.data.transactions[0].amount_cents,1800);assert.deepEqual(result.data.transactions[0].tags,['Roma']);
  assert.equal(env.DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
});
test('ambiguity prevents even partial drafts from reaching review',async()=>{
  const result=await smartPreview(request(),environment(),'alice','2026-11-07',async()=>reply({question:'What was your share?',transactions:[draft]}));
  assert.deepEqual(result.data,{question:'What was your share?',transactions:[]});
});
test('bad model output is rejected as a whole',async()=>{
  for(const invalid of [{...draft,amount_cents:20.125},{...draft,category_id:'invented'},{...draft,occurred_on:'2026-02-30'},{...draft,tags:['<script>']}]){
    const result=await smartPreview(request(),environment(),'alice','2026-11-07',async()=>reply({question:'',transactions:[draft,invalid]}));assert.equal(result.status,502);assert.equal(result.data.transactions,undefined);
  }
});
test('provider failure and missing credentials never expose secrets',async()=>{
  for(const response of [new Response('secret provider detail',{status:401}),new Response('credit detail',{status:429}),new Response('{bad')]){
    const result=await smartPreview(request(),environment(),'alice','2026-11-07',async()=>response);assert.ok(result.status>=500);assert.ok(!JSON.stringify(result).includes('test-key-not-real'));assert.ok(!JSON.stringify(result).includes('secret provider'));
  }
  const result=await smartPreview(request(),{DB:createDB()},'alice','2026-11-07',()=>{throw Error('must not call');});assert.equal(result.status,503);
});
test('timeout, refusal and incomplete generation fail without drafts',async()=>{
  for(const provider of [async()=>{throw Error('network');},async()=>new Response(JSON.stringify({status:'incomplete',output:[]})),async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]}))]){
    const result=await smartPreview(request(),environment(),'alice','2026-11-07',provider);assert.ok(result.status>=500);assert.equal(result.data.transactions,undefined);
  }
});
test('rate limiting is atomic and per user',async()=>{
  const env=environment();let calls=0;const provider=async()=>{calls++;return reply({question:'',transactions:[draft]});};
  const results=await Promise.all(Array.from({length:12},()=>smartPreview(request(),env,'alice','2026-11-07',provider)));
  assert.equal(calls,10);assert.equal(results.filter(r=>r.status===429).length,2);
  assert.equal((await smartPreview(request(),env,'bob','2026-11-07',provider)).status,200);
});
test('preview route requires sign-in and same-origin request header',async()=>{
  const env=environment();assert.equal((await worker.fetch(request(),env)).status,401);
  const req=request();req.headers.set('oai-authenticated-user-id','alice');assert.equal((await worker.fetch(req,env)).status,403);
  req.headers.set('x-pocket-client','1');req.headers.set('origin','https://evil.test');assert.equal((await worker.fetch(req,env)).status,403);
});
test('invalid and oversized input rejected before provider call',async()=>{
  for(const input of [{...body,text:''},{...body,text:'x'.repeat(3001)},{...body,date:'invalid'}])await assert.rejects(smartPreview(request(input),environment(),'alice','2026-11-07',()=>{throw Error('must not call');}));
});
