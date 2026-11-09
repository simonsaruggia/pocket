import test from 'node:test';
import assert from 'node:assert/strict';
import {createDB} from './helpers.mjs';
import {tripRules,saveTripRule,applyTripRules} from '../src/rules.js';
import {smartPreview} from '../src/smart.js';
import worker from '../src/server.js';
const rule={action:'create',tag:'Helsinki',starts_on:'2026-11-07',ends_on:'2026-11-15',id:null,revision:0};
const expense=(date,mode='default',tags=[])=>({amount_cents:1800,category_id:'food-6',occurred_on:date,note:'Lunch',tags,tag_mode:mode});
test('rules are persistent, isolated, idempotent and do not change old expenses',async()=>{
 const db=createDB(),body={request_id:'create-12345',rule};await saveTripRule(db,'alice',body);await saveTripRule(db,'alice',body);
 assert.equal((await tripRules(db,'alice')).length,1);assert.equal((await tripRules(db,'bob')).length,0);assert.equal(db.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
 let r=(await tripRules(db,'alice'))[0];await saveTripRule(db,'alice',{request_id:'update-12345',rule:{...r,action:'update',ends_on:'2026-11-17'}});
 await saveTripRule(db,'alice',body);assert.equal((await tripRules(db,'alice')).length,1);
 await assert.rejects(saveTripRule(db,'alice',{request_id:'stale-12345',rule:{...r,action:'cancel'}}));
 r=(await tripRules(db,'alice'))[0];const cancel={request_id:'cancel-12345',rule:{...r,action:'cancel'}};await saveTripRule(db,'alice',cancel);await saveTripRule(db,'alice',cancel);assert.equal((await tripRules(db,'alice'))[0].active,0);
 await assert.rejects(saveTripRule(db,'bob',{request_id:'cross-user-12345',rule:{...r,action:'update'}}));
});
test('date boundaries, expired rules and explicit overrides are deterministic',()=>{
 const rules=[{...rule,active:1}];
 const rows=['2026-11-06','2026-11-07','2026-11-15','2026-11-16'].map(d=>expense(d));
 assert.deepEqual(applyTripRules(rows,rules).transactions.map(t=>t.tags),[[],['Helsinki'],['Helsinki'],[]]);
 assert.deepEqual(applyTripRules([expense('2026-11-08','none',['wrong'])],rules).transactions[0].tags,[]);
 assert.deepEqual(applyTripRules([expense('2026-11-08','explicit',['Roma'])],rules).transactions[0].tags,['Roma']);
 assert.deepEqual(applyTripRules([expense('2026-11-08')],[{...rule,active:0}]).transactions[0].tags,[]);
});
test('overlaps ask a question; same tag overlaps do not duplicate tags',()=>{
 const rules=[{...rule,active:1},{...rule,active:1,tag:'grecia'}];assert.ok(applyTripRules([expense('2026-11-08')],rules).question);
 rules[1].tag='HELSINKI';assert.equal(applyTripRules([expense('2026-11-08')],rules).transactions[0].tags.length,1);
});
test('chat drafts rules without saving and supplies history to GPT',async()=>{
 const env={DB:createDB(),OPENAI_API_KEY:'fake'};
 const req=new Request('https://test/api/expenses/preview',{method:'POST',body:JSON.stringify({chat:true,text:'through the 15th',date:'2026-11-07',messages:[{role:'user',content:'Remember Helsinki from today'},{role:'assistant',content:'Until what date?'}]})});
 const r=await smartPreview(req,env,'alice','2026-11-07',async(_,options)=>{const body=JSON.parse(options.body);assert.equal(JSON.parse(body.input).conversation.length,2);return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({question:'',transactions:[],rule_action:rule})}]}]}));});
 assert.equal(r.status,200);assert.equal(r.data.rule_action.tag,'Helsinki');assert.equal((await tripRules(env.DB,'alice')).length,0);
});
test('rule endpoints reject unauthenticated and cross-origin changes',async()=>{
 const env={DB:createDB()};const req=new Request('https://test/api/trip-rules',{method:'POST',body:JSON.stringify({rule,request_id:'request-12345'})});
 assert.equal((await worker.fetch(req,env)).status,401);req.headers.set('oai-authenticated-user-id','alice');assert.equal((await worker.fetch(req,env)).status,403);
 req.headers.set('x-pocket-client','1');req.headers.set('origin','https://other');assert.equal((await worker.fetch(req,env)).status,403);
});
