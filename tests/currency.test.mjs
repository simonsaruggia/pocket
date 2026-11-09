import test from 'node:test';
import assert from 'node:assert/strict';
import {createDB} from './helpers.mjs';
import {convertCents,normalizeExpense} from '../src/currency.js';
import worker from '../src/server.js';
const item={amount_cents:9200000,currency:'ARS',category_id:'food-6',occurred_on:'2026-11-05',note:'Dinner',tags:['Argentina']};
function env(){return {DB:createDB(),FX_TODAY:'2026-11-08',FX_FETCH:async url=>new Response(JSON.stringify(url.includes('argentinadatos')?{casa:'oficial',fecha:'2026-11-05',venta:1500}:{base:'USD',quote:'EUR',date:'2026-11-05',rate:0.9}))};}
async function api(e,path,method='GET',body){return worker.fetch(new Request('https://pocket.test'+path,{method,headers:{'content-type':'application/json','x-pocket-client':'1','oai-authenticated-user-id':'alice'},...(body?{body:JSON.stringify(body)}:{})}),e);}
test('ARS official -> USD -> EUR rounds once, USD converts, EUR untouched',async()=>{
 const e=env();assert.equal(convertCents(9200000,'0.9','1500'),5520);
 assert.equal(convertCents(100,'0.9','6'),15);
 const ars=await normalizeExpense(e,item);assert.equal(ars.amount_cents,5520);assert.match(ars.note,/official ARS\/USD venta 1500/);assert.equal(ars.fx.original_amount_cents,9200000);
 assert.equal((await normalizeExpense(e,{...item,currency:'USD',amount_cents:10000})).amount_cents,9000);
 const eur=await normalizeExpense(e,{...item,currency:'EUR'});assert.equal(eur.amount_cents,item.amount_cents);assert.equal(eur.note,item.note);assert.equal(eur.fx,null);
});
test('preview never saves; confirmation and retries never double convert or duplicate',async()=>{
 const e=env(),preview=await (await api(e,'/api/expenses/convert','POST',item)).json();
 assert.equal(e.DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
 const body={request_id:'foreign-save-123',transactions:[preview]};
 const first=await(await api(e,'/api/transactions','POST',body)).json();const second=await(await api(e,'/api/transactions','POST',body)).json();
 assert.equal(first.saved[0].amount_cents,5520);assert.equal(second.saved[0].id,first.saved[0].id);
 const state=await(await api(e,'/api/state')).json();assert.equal(state.currency,'EUR');assert.equal(state.transactions.length,1);assert.equal(state.transactions[0].fx.ars_per_usd,'1500');
});
test('missing official rate does not fall back to blue and failed batch saves nothing',async()=>{
 const e=env();e.FX_FETCH=async url=>new Response(JSON.stringify(url.includes('argentinadatos')?{casa:'blue',fecha:'2026-11-05',venta:1500}:{base:'USD',quote:'EUR',date:'2026-11-05',rate:0.9}));
 const r=await api(e,'/api/transactions','POST',{request_id:'failed-fx-123',transactions:[{...item,currency:'EUR'},item]});assert.equal(r.status,400);assert.equal(e.DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
});
test('rate metadata survives edits and legacy euro rows remain unchanged',async()=>{
 const e=env();e.DB.sql.prepare('INSERT INTO transactions (id,user_id,request_id,amount_cents,kind,category_id,occurred_on,note,tags,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('old','alice','old',1234,'expense','food-6','2026-10-05','Existing dinner','[]','now');
 const before=e.DB.sql.prepare('SELECT * FROM transactions').all();await api(e,'/api/state');assert.deepEqual(e.DB.sql.prepare('SELECT * FROM transactions').all(),before);
 const r=await(await api(e,'/api/transactions','POST',{request_id:'edit-fx-123',transactions:[item]})).json();
 await api(e,'/api/transactions/'+r.saved[0].id,'PUT',{...item,amount_cents:1500000});const state=await(await api(e,'/api/state')).json();const edited=state.transactions.find(t=>t.id===r.saved[0].id);assert.equal(edited.amount_cents,900);assert.equal(edited.fx.original_amount_cents,1500000);
});
