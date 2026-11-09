import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify,createHash} from 'node:crypto';
import {createDB} from './helpers.mjs';
import {createBanking,vault,bankJWT,bankRecord,BANK_ORIGIN} from '../scripts/banking.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const pem=privateKey.export({type:'pkcs8',format:'pem'});
function setup(){const DB=createDB();let calls=[];const fetcher=async(url,opts)=>{calls.push({url,opts});if(url.endsWith('/aspsps'))return Response.json({aspsps:[{name:'Revolut',country:'LT',psu_types:['personal'],maximum_consent_validity:86400}]});if(url.endsWith('/auth'))return Response.json({url:'https://auth.enablebanking.com/ais/start?sessionid=test'});if(url.endsWith('/sessions'))return Response.json({session_id:'session-1',accounts:[{uid:'account-1',identification_hash:'stable-hash',currency:'EUR'}],access:{valid_until:new Date(Date.now()+86400000).toISOString()}});if(url.includes('/transactions?'))return Response.json({transactions:[purchase],continuation_key:null});return Response.json({});};const bank=createBanking({sql:DB.sql,DB,owner:'alice',access:'a'.repeat(60),env:{DB},fetcher,settings:{ENABLE_BANKING_APP_ID:'app-1',ENABLE_BANKING_PRIVATE_KEY:pem}});return {DB,bank,calls};}
const purchase={entry_reference:'immutable-1',transaction_amount:{amount:'18.50',currency:'EUR'},status:'BOOK',credit_debit_indicator:'DBIT',booking_date:'2026-11-08',creditor:{name:'Cafe Test'},remittance_information:['Lunch']};
function req(path,body,headers={}){return new Request(BANK_ORIGIN+path,{method:body?'POST':'GET',headers:{'content-type':'application/json','origin':BANK_ORIGIN,'x-pocket-client':'1',...headers},...(body?{body:JSON.stringify(body)}:{})});}
test('bank secrets are encrypted and JWT has correct audience and signature',()=>{const v=vault('secret'),sealed=v.seal({session:'sensitive'});assert(!sealed.includes('sensitive'));assert.deepEqual(v.open(sealed),{session:'sensitive'});assert.throws(()=>vault('wrong').open(sealed));const jwt=bankJWT('app',pem);const [h,p,s]=jwt.split('.');assert.equal(JSON.parse(Buffer.from(p,'base64url')).aud,'api.enablebanking.com');assert(verify('RSA-SHA256',Buffer.from(h+'.'+p),publicKey,Buffer.from(s,'base64url')));});
test('pending is ignored and stable IDs survive reconnects; missing IDs keep separate occurrences',()=>{assert.equal(bankRecord({...purchase,status:'PDNG'},'hash'),null);assert.equal(bankRecord(purchase,'hash').entry,'immutable-1');assert.notEqual(bankRecord({...purchase,entry_reference:null},'hash',0).entry,bankRecord({...purchase,entry_reference:null},'hash',1).entry);});
test('duplicate bank fetches do not create expenses and review-save is idempotent',async()=>{const {DB,bank}=setup();await bank.ingest({hash:'stable'},purchase,0);await bank.ingest({hash:'stable'},purchase,0);assert.equal(bank.state().items.length,1);assert.equal(DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);const item=bank.state().items[0];const body={id:item.id,action:'save',category_id:'food-6',tags:['Roma'],confirm_duplicate:true};assert.equal((await bank.route(req('/api/bank/review',body))).status,200);await bank.route(req('/api/bank/review',body));assert.equal(DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,1);assert.equal(DB.sql.prepare('SELECT amount_cents FROM transactions').get().amount_cents,1850);});
test('existing manual expense triggers duplicate warning and incoming refund cannot save',async()=>{const {DB,bank}=setup();DB.sql.prepare('INSERT INTO transactions(id,user_id,request_id,amount_cents,kind,category_id,occurred_on,note,tags,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('old','alice','old',1850,'expense','food-6','2026-11-07','Lunch','[]','now');await bank.ingest({hash:'stable'},purchase,0);assert.match(bank.state().items[0].reason,/duplicate/);const item=bank.state().items[0];assert.equal((await bank.route(req('/api/bank/review',{id:item.id,action:'save',category_id:'food-6',tags:[]}))).status,400);await bank.ingest({hash:'stable'},{...purchase,entry_reference:'refund',credit_debit_indicator:'CRDT'},0);assert.equal(bank.state().items.find(x=>x.record.entry==='refund').draft,null);});
test('cross-origin writes and other owner items are rejected',async()=>{const {DB,bank}=setup();const r=await bank.route(req('/api/bank/settings',{auto_save:true,ai_enabled:true},{origin:'https://evil.test'}));assert.equal(r.status,400);assert.equal(bank.state().auto_save,false);const v=vault('a'.repeat(60));DB.sql.prepare('INSERT INTO bank_items(id,user_id,account_hash,entry_ref,payload,created_at) VALUES (?,?,?,?,?,?)').run('bob','bob','h','e',v.seal({note:'secret'}),'now');assert.equal(bank.state().items.length,0);assert.equal((await bank.route(req('/api/bank/review',{id:'bob',action:'dismiss'}))).status,400);});
test('callback rejects missing browser binding, accepts correct state once and keeps key server-side',async()=>{const {bank,calls}=setup();const r=await bank.route(req('/api/bank/connect',{name:'Revolut',country:'LT',from:'2026-11-08'}));assert.equal(r.status,200);const auth=JSON.parse(calls.find(c=>c.url.endsWith('/auth')).opts.body);assert.equal(auth.access.balances,false);const cookie=r.headers.get('set-cookie').split(';')[0];assert.equal((await bank.callback(req('/banking/callback?state='+auth.state+'&code=test'))).status,400);const callback=req('/banking/callback?state='+auth.state+'&code=test',null,{cookie});assert.equal((await bank.callback(callback)).status,200);assert.equal((await bank.callback(callback)).status,400);const state=bank.state();assert(state.connected);assert(!JSON.stringify(state).includes('session-1'));assert(!JSON.stringify(state).includes('PRIVATE KEY'));await bank.sync();assert.equal(bank.state().items.length,1);await assert.rejects(bank.sync(),/six hours/);});
test('bank changes flag review rather than creating another expense',async()=>{const {DB,bank}=setup();await bank.ingest({hash:'stable'},purchase,0);await bank.ingest({hash:'stable'},{...purchase,transaction_amount:{amount:'19.50',currency:'EUR'}},0);assert.equal(bank.state().items.length,1);assert.equal(bank.state().items[0].draft,null);assert.match(bank.state().items[0].reason,/changed/);assert.equal(DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);});
test('auto-save requires explicit opt-in and a clear model classification',async()=>{
 const DB=createDB();const bank=createBanking({sql:DB.sql,DB,owner:'alice',access:'x'.repeat(60),env:{DB,OPENAI_API_KEY:'fake-test-key'},settings:{},fetcher:async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({category_id:'food-6',type:'expense',confidence:0.99})}]}]})});
 await bank.route(req('/api/bank/settings',{auto_save:true,ai_enabled:true}));await bank.ingest({hash:'a'},purchase,0);assert.equal(DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,1);
 await bank.ingest({hash:'a'},{...purchase,entry_reference:'second'},0);assert.equal(DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,1);assert.match(bank.state().items[0].reason,/duplicate/);
});
test('sync failures record an error and keep saved transactions intact',async()=>{
 const {DB,bank}=setup();const v=vault('a'.repeat(60));DB.sql.prepare('INSERT INTO bank_config(user_id,session,accounts,expires,sync_from) VALUES (?,?,?,?,?)').run('alice',v.seal('expired'),v.seal([]),'2000-01-01','2026-11-08');await assert.rejects(bank.sync(),/expired/);assert.match(bank.state().error,/expired/);assert.equal(DB.sql.prepare('SELECT count(*) n FROM transactions').get().n,0);
});

test('manual refresh bypasses background cooldown with user headers and leaves its schedule unchanged',async()=>{
 const {DB,bank,calls}=setup(),v=vault('a'.repeat(60)),last=Date.now();
 DB.sql.prepare('INSERT INTO bank_config(user_id,session,accounts,expires,sync_from,last_attempt) VALUES (?,?,?,?,?,?)').run('alice',v.seal('session-1'),v.seal([{uid:'account-1',hash:'stable-hash'}]),new Date(Date.now()+86400000).toISOString(),'2026-11-08',last);
 await assert.rejects(bank.sync(),/six hours/);
 const headers={'x-real-ip':'203.0.113.10','user-agent':'Pocket test browser','accept-language':'en'};
 assert.equal((await bank.route(req('/api/bank/sync',{manual:true},headers))).status,202);
 while(bank.state().syncing)await new Promise(resolve=>setImmediate(resolve));
 const call=calls.find(c=>c.url.includes('/transactions?'));
 assert.equal(call.opts.headers['Psu-Ip-Address'],'203.0.113.10');
 assert.equal(call.opts.headers['Psu-User-Agent'],'Pocket test browser');
 assert.equal(call.opts.headers['Psu-accept-language'],'en');
 assert.equal(DB.sql.prepare('SELECT last_attempt FROM bank_config').get().last_attempt,last);
 assert.equal(bank.state().items.length,1);
 assert.equal((await bank.route(req('/api/bank/sync',{manual:true},headers))).status,202);
 while(bank.state().syncing)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(bank.state().items.length,1);
 DB.sql.prepare('UPDATE bank_config SET last_attempt=0').run();
 await bank.sync();
 const background=calls.filter(c=>c.url.includes('/transactions?')).at(-1);
 assert(!Object.keys(background.opts.headers).some(k=>k.toLowerCase().startsWith('psu-')));
 await assert.rejects(bank.sync(),/six hours/);
});

test('manual refresh requires real browser metadata and same-origin explicit request',async()=>{
 const {DB,bank,calls}=setup(),v=vault('a'.repeat(60));
 DB.sql.prepare('INSERT INTO bank_config(user_id,session,accounts,expires,sync_from) VALUES (?,?,?,?,?)').run('alice',v.seal('session'),v.seal([]),new Date(Date.now()+86400000).toISOString(),'2026-11-08');
 for(const [body,headers] of [
  [{manual:true},{}],
  [{manual:true,ip:'203.0.113.1'},{'user-agent':'test'}],
  [{manual:true},{'x-real-ip':'not-an-ip','user-agent':'test'}],
  [{},{'x-real-ip':'203.0.113.1','user-agent':'test'}],
  [{manual:true},{origin:'https://evil.test','x-real-ip':'203.0.113.1','user-agent':'test'}]
 ])assert.equal((await bank.route(req('/api/bank/sync',body,headers))).status,400);
 assert.equal(calls.length,0);
 assert.equal(DB.sql.prepare('SELECT last_attempt FROM bank_config').get().last_attempt,0);
});
