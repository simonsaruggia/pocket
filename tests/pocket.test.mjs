import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDB} from './helpers.mjs';
import {CATEGORIES,GROUPS,euroCents,parseQuick,validDate,summary,filterRows,overviewSummary} from '../src/domain.js';
const source=readFileSync(new URL('../dist/server/index.js',import.meta.url),'utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const base={amount_cents:1850,category_id:'food-6',occurred_on:'2026-10-12',note:'Lunch',tags:['Roma']};
function call(env,path,method='GET',data,user='alice',extra={}){const headers={'content-type':'application/json','x-pocket-client':'1',...extra};if(user)headers['oai-authenticated-user-id']=user;return worker.fetch(new Request('https://pocket.test'+path,{method,headers,...(data?{body:JSON.stringify(data)}:{})}),env);}
async function rpc(env,name,args={},user='alice'){return call(env,'/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},user);}
test('category regrouping preserves historical IDs except the approved Drinks merge',()=>{
  const legacy={entertainment:['Alcohol','Attività varie','Cigarettes cigars etc','Disco/tickets/events','Gambilng'],essentials:['Bank and fees','Dentist and related','Healthcare doctor','Iliad / internet','Rent','Service','Hotel / Airbnb'],food:['Bar and coffee','Delivery','Drinks','Fast food - Snacks','Gelato','Groceries','Restaurants'],shopping:['App subscriptions','Clothes and shoes','Electronics and Gadgets','Gifts for others','Haircut / self care','Miscellaneous'],transportation:['Autostrada','Bus / train','Car costs / Repairs','Flights','Fuel','Parking','Public transport','Taxi/uber','Rented vehicle'],wellness:['Coaching','Gym','Gym equipment','Supplements']};
  const expected=Object.fromEntries(Object.entries(legacy).flatMap(([group,names])=>names.map((name,i)=>[group+'-'+i,name])));
  delete expected['food-2'];expected['entertainment-0']='Drinks / Alcohol';expected['entertainment-4']='Gambling';
  assert.deepEqual(Object.fromEntries(CATEGORIES.map(c=>[c.id,c.name])),expected);
  assert.equal(GROUPS.length,9);assert.equal(CATEGORIES.length,37);assert.equal(new Set(CATEGORIES.map(c=>c.id)).size,37);
  assert(!GROUPS.some(g=>/essential|mandatory/i.test(g.name)));
  for(const [id,group] of [['food-5','groceries'],['food-6','food'],['essentials-6','accommodation'],['essentials-2','health'],['wellness-1','health'],['shopping-0','home'],['shopping-5','other']])assert.equal(CATEGORIES.find(c=>c.id===id).groupId,group);
});
test('EUR cents remain exact and malformed/currency amounts are rejected',()=>{assert.equal(euroCents('12,50'),1250);assert.equal(euroCents('1.234,56'),123456);assert.equal(euroCents('1,234.56'),123456);assert.equal(euroCents('0.29'),29);for(const v of ['-12','1.234','NaN','0','1.0012'])assert.throws(()=>euroCents(v));});
test('English and Italian quick entry with tags, relative dates and multiple lines',()=>{const list=parseQuick('€12,50 pranzo #Roma\n€4 coffee ieri #Monte_Carlo','2026-10-12');assert.equal(list.length,2);assert.equal(list[0].amount_cents,1250);assert.equal(list[0].category_id,'food-6');assert.deepEqual(list[0].tags,['Roma']);assert.equal(list[1].category_id,'food-0');assert.equal(list[1].occurred_on,'2026-10-11');assert.throws(()=>parseQuick('€2400 stipendio','2026-10-12'),/expenses only/);assert.equal(parseQuick('€10 unknown','2026-10-12','Roma')[0].needs_review,true);assert.throws(()=>parseQuick('€4 coffee €10 taxi','2026-10-12'));assert.throws(()=>parseQuick('$10 lunch','2026-10-12'));assert.equal(validDate('2026-02-30'),false);});
test('save and retry are idempotent; invalid batches do not partially save',async()=>{const env={DB:createDB()};let response=await call(env,'/api/transactions','POST',{request_id:'request-one',transactions:[base]});assert.equal(response.status,201);const first=(await response.json()).saved[0];response=await call(env,'/api/transactions','POST',{request_id:'request-one',transactions:[base]});assert.equal((await response.json()).saved[0].id,first.id);const state=await (await call(env,'/api/state')).json();assert.equal(state.transactions.length,1);assert.deepEqual(state.tags,['Roma']);response=await call(env,'/api/transactions','POST',{request_id:'request-two',transactions:[base,{...base,amount_cents:-1}]});assert.equal(response.status,400);assert.equal((await (await call(env,'/api/state')).json()).transactions.length,1);response=await call(env,'/api/transactions','POST',{request_id:'request-one',transactions:[{...base,amount_cents:5000}]});assert.equal(response.status,400);});
test('data and edits are isolated per user; missing identity and cross-origin writes rejected',async()=>{const env={DB:createDB()};assert.equal((await call(env,'/api/state','GET',null,null)).status,401);let r=await call(env,'/api/transactions','POST',{request_id:'request-user',transactions:[base]});const id=(await r.json()).saved[0].id;assert.equal((await (await call(env,'/api/state','GET',null,'bob')).json()).transactions.length,0);assert.equal((await call(env,'/api/transactions/'+id,'DELETE',null,'bob')).status,404);assert.equal((await call(env,'/api/transactions/'+id,'PUT',base,'bob')).status,404);assert.equal((await call(env,'/api/tags','POST',{name:'attack'},'alice',{origin:'https://other.test'})).status,403);assert.equal((await rpc(env,'get_spending_summary',{},null)).status,401);});
test('edits, deletion, tags and budget changes persist',async()=>{const env={DB:createDB()};const data=await (await call(env,'/api/transactions','POST',{request_id:'request-edit',transactions:[base]})).json();const id=data.saved[0].id;assert.equal((await call(env,'/api/transactions/'+id,'PUT',{...base,amount_cents:2100,category_id:'food-5',tags:['Monte_Carlo']})).status,200);await call(env,'/api/budget','PUT',{month:'2026-10',amount_cents:150000});await call(env,'/api/tags','POST',{name:'Summer 2027'});let state=await (await call(env,'/api/state')).json();assert.equal(state.transactions[0].amount_cents,2100);assert.deepEqual(state.transactions[0].tags,['Monte_Carlo']);assert.equal(state.budgets[0].amount_cents,150000);assert(state.tags.includes('Summer 2027'));assert.equal((await call(env,'/api/transactions/'+id,'DELETE')).status,200);state=await (await call(env,'/api/state')).json();assert.equal(state.transactions.length,0);});
test('expense totals span months and use case-insensitive tags',async()=>{const env={DB:createDB()};const items=[base,{...base,amount_cents:3000,occurred_on:'2026-09-30',category_id:'transportation-7',tags:['roma']}];const saved=await rpc(env,'add_transactions',{request_id:'chat-save-01',transactions:items});assert.equal((await saved.json()).result.isError,undefined);const r=await (await rpc(env,'get_spending_summary',{tag:'ROMA'})).json();assert.equal(r.result.structuredContent.spending,4850);assert(!('income' in r.result.structuredContent));assert(!('net' in r.result.structuredContent));const monthly=await (await rpc(env,'get_spending_summary',{month:'2026-10'})).json();assert.equal(monthly.result.structuredContent.spending,1850);const other=await (await rpc(env,'get_spending_summary',{},'bob')).json();assert.equal(other.result.structuredContent.spending,0);});
test('MCP initializes, discovers tools without leaking records, and paginates',async()=>{const env={DB:createDB()};let r=await call(env,'/mcp','POST',{jsonrpc:'2.0',id:1,method:'initialize',params:{}},null);assert.equal((await r.json()).result.serverInfo.name,'Pocket');r=await call(env,'/mcp','POST',{jsonrpc:'2.0',id:2,method:'tools/list'},null);assert.equal((await r.json()).result.tools.length,7);await rpc(env,'add_transactions',{request_id:'batch-list-01',transactions:[base,{...base,note:'Second'}]});r=await rpc(env,'list_transactions',{limit:1});const d=(await r.json()).result.structuredContent;assert.equal(d.transactions.length,1);assert.equal(d.total,2);assert.equal(d.next_offset,1);});
test('asset delivery is complete and unknown paths do not expose data',async()=>{const env={DB:createDB()};assert.equal((await call(env,'/')).status,200);assert.equal((await call(env,'/styles.css')).status,200);assert.equal((await call(env,'/app.js')).status,200);assert.equal((await call(env,'/domain.js')).status,200);assert.equal((await call(env,'/missing')).status,404);});

test('legacy income is excluded from the API, tools and totals without deleting records',async()=>{
  const env={DB:createDB()};
  env.DB.sql.prepare('INSERT INTO transactions (id,user_id,request_id,amount_cents,kind,category_id,occurred_on,note,tags,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run('old-income','alice','old-income-request',200000,'income','income-0','2026-10-12','Salary','["Roma"]','2026-10-12T12:00:00Z');
  await call(env,'/api/transactions','POST',{request_id:'only-expenses',transactions:[base]});
  const state=await (await call(env,'/api/state')).json();
  assert.equal(state.transactions.length,1);assert.equal(state.transactions[0].kind,'expense');
  const list=(await (await rpc(env,'list_transactions')).json()).result.structuredContent;
  assert.equal(list.total,1);assert(list.transactions.every(t=>t.kind==='expense'));
  const result=(await (await rpc(env,'get_spending_summary',{tag:'Roma'})).json()).result.structuredContent;
  assert.equal(result.spending,1850);assert.equal(result.count,1);assert(!('income' in result));assert(!('net' in result));
  const raw=env.DB.sql.prepare('SELECT * FROM transactions').all().map(r=>({...r,tags:JSON.parse(r.tags)}));
  assert.equal(raw.length,2);assert.equal(summary(raw).spending,1850);assert.equal(summary(raw).count,1);assert.equal(filterRows(raw).length,1);
  assert.equal((await call(env,'/api/transactions/old-income','PUT',base)).status,404);
});
test('API and ChatGPT tools reject income on create and edit',async()=>{
  const env={DB:createDB()};
  for(const t of [{...base,kind:'income'},{...base,category_id:'income-0'}]){
    assert.equal((await call(env,'/api/transactions','POST',{request_id:'rejected-income',transactions:[t]})).status,400);
    assert.equal((await (await rpc(env,'add_transactions',{request_id:'rejected-tool',transactions:[t]})).json()).result.isError,true);
  }
  const saved=await (await call(env,'/api/transactions','POST',{request_id:'valid-expense',transactions:[base]})).json();
  assert.equal((await call(env,'/api/transactions/'+saved.saved[0].id,'PUT',{...base,kind:'income'})).status,400);
  assert.equal((await (await call(env,'/api/state')).json()).transactions.length,1);
  const categories=(await (await rpc(env,'list_categories')).json()).result.structuredContent.categories;
  assert(categories.every(c=>c.kind==='expense'));
  const discovery=await (await call(env,'/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'})).json();
  assert(!JSON.stringify(discovery).includes('income'));
});

test('chat expense workflow saves euros, retries, corrects and undoes only the caller’s records',async()=>{
  const env={DB:createDB()};
  const args={request_id:'chat-lunch-rome',amount_eur:'22',category:'Restaurants',note:'Lunch in Rome',tags:['Roma']};
  const first=(await (await rpc(env,'add_expense',args)).json()).result.structuredContent.saved[0];
  assert.equal(first.amount_cents,2200);assert.equal(first.category_id,'food-6');assert.deepEqual(first.tags,['Roma']);
  assert.equal(first.occurred_on,new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  assert.equal((await (await rpc(env,'add_expense',args)).json()).result.structuredContent.saved[0].id,first.id);
  assert.equal((await (await rpc(env,'add_expense',{...args,amount_eur:'23'})).json()).result.isError,true);
  assert.equal((await (await rpc(env,'update_expense',{transaction_id:first.id,amount_eur:'23'},'bob')).json()).result.isError,true);
  assert.equal((await (await rpc(env,'delete_expense',{transaction_id:first.id},'bob')).json()).result.structuredContent.deleted,false);
  const updated=(await (await rpc(env,'update_expense',{transaction_id:first.id,amount_eur:'24.50',tags:['Monte_Carlo']})).json()).result.structuredContent.saved;
  assert.equal(updated.amount_cents,2450);assert.equal(updated.note,'Lunch in Rome');assert.deepEqual(updated.tags,['Monte_Carlo']);
  const state=await (await call(env,'/api/state')).json();assert(state.tags.includes('Monte_Carlo'));assert.equal(state.transactions.length,1);
  assert.equal((await (await rpc(env,'delete_expense',{transaction_id:first.id})).json()).result.structuredContent.deleted,true);
  assert.equal((await (await rpc(env,'delete_expense',{transaction_id:first.id})).json()).result.structuredContent.already_absent,true);
  assert.equal((await (await call(env,'/api/state')).json()).transactions.length,0);
});
test('chat tools declare OAuth and reject unauthenticated or invalid expense writes',async()=>{
  const env={DB:createDB()};
  const discovery=(await (await call(env,'/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list'},null)).json()).result;
  for(const tool of discovery.tools){assert.deepEqual(tool.securitySchemes,[{type:'oauth2',scopes:[]}]);assert.deepEqual(tool._meta.securitySchemes,tool.securitySchemes);}
  const args={request_id:'invalid-expense',amount_eur:'22',category:'Restaurants'};
  const unauth=await rpc(env,'add_expense',args,null);assert.equal(unauth.status,401);assert(unauth.headers.get('www-authenticate').includes('oauth-protected-resource'));
  assert((await unauth.json()).result._meta['mcp/www_authenticate'].length);
  for(const patch of [{amount_eur:'-5'},{amount_eur:'22.001'},{amount_eur:'$22'},{amount_eur:22},{category:'Invented'},{occurred_on:'2026-02-30'},{kind:'income'}])assert.equal((await (await rpc(env,'add_expense',{...args,...patch})).json()).result.isError,true);
  assert.equal((await (await call(env,'/api/state')).json()).transactions.length,0);
});
test('retry with omitted date preserves original purchase date across midnight',async()=>{
  const env={DB:createDB()};const args={request_id:'midnight-expense',amount_eur:'22',category:'Restaurants'};
  const saved=(await (await rpc(env,'add_expense',{...args,occurred_on:'2026-01-01'})).json()).result.structuredContent.saved[0];
  const retry=(await (await rpc(env,'add_expense',args)).json()).result.structuredContent.saved[0];
  assert.equal(retry.id,saved.id);assert.equal(retry.occurred_on,'2026-01-01');
});

test('overview allocates tagged expenses once, preserves categories and groups shared tags',()=>{
  const expense={...base,kind:'expense'};
  const rows=[{...expense,tags:[],amount_cents:1000},{...expense,tags:['Helsinki'],category_id:'essentials-6',amount_cents:5800},{...expense,tags:['helsinki'],category_id:'transportation-3',amount_cents:20564},{...expense,tags:['Roma','Helsinki'],amount_cents:101},{...expense,tags:['HELSINKI','roma'],amount_cents:99},{...expense,kind:'income',amount_cents:999999}];
  const before=JSON.stringify(rows),s=overviewSummary(rows);
  assert.equal(s.spending,27564);assert.equal(s.groups.food,1000);assert.equal(s.groups.trips,26564);assert.equal(s.groups.accommodation,undefined);assert.equal(s.groups.transportation,undefined);
  assert.equal(Object.values(s.groups).reduce((a,b)=>a+b,0),s.spending);
  assert.equal(s.trips.reduce((a,b)=>a+b.amount_cents,0),s.groups.trips);
  assert.equal(s.trips.length,2);assert.equal(s.trips[0].amount_cents,26364);assert.deepEqual(s.trips[1].tags,['Helsinki','Roma']);assert.equal(s.trips[1].amount_cents,200);
  assert.equal(s.categories['essentials-6'],5800);assert.equal(s.categories['transportation-3'],20564);assert.equal(JSON.stringify(rows),before);
  assert.deepEqual(overviewSummary([]).trips,[]);
  const october=overviewSummary(filterRows(rows,{month:'2026-10'}));assert.equal(october.spending,s.spending);
  assert.equal(overviewSummary(rows.map(t=>({...t,tags:[]}))).groups.trips,undefined);
});

test('category-level overview keeps tagged expenses separate and trip filters compose',()=>{
  const rows=[
    {...base,kind:'expense',tags:[],category_id:'food-6',amount_cents:1000},
    {...base,kind:'expense',tags:['Grecia'],category_id:'food-6',amount_cents:2300},
    {...base,kind:'expense',tags:['grecia'],category_id:'food-5',amount_cents:700},
    {...base,kind:'expense',tags:['Grecia','Summer'],category_id:'essentials-6',amount_cents:5000},
    {...base,kind:'income',tags:['Grecia'],category_id:'food-6',amount_cents:9999}
  ];
  const s=overviewSummary(rows);
  assert.deepEqual(s.everydayCategories,{'food-6':1000});
  assert.equal(Object.values(s.everydayCategories).reduce((a,b)=>a+b,0)+s.groups.trips,s.spending);
  assert.equal(summary(filterRows(rows,{tag:'Grecia',group:'food'})).spending,2300);
  assert.equal(summary(filterRows(rows,{tag:'Grecia',group:'groceries'})).spending,700);
  assert.equal(summary(filterRows(rows,{tag:'Grecia',category:'food-6'})).spending,2300);
  assert.equal(filterRows(rows,{tag:'Grecia',group:'food',category:'essentials-6'}).length,0);
  assert.equal(filterRows(rows,{tag:'Grecia'}).length,3);
});


test('rented vehicle preserves existing IDs and updates only the requested expense category',async()=>{
  assert.equal(CATEGORIES.find(c=>c.name==='Car costs / Repairs').id,'transportation-2');
  assert.equal(CATEGORIES.find(c=>c.name==='Taxi/uber').id,'transportation-7');
  assert.equal(CATEGORIES.find(c=>c.name==='Rented vehicle').id,'transportation-8');
  const env={DB:createDB()};
  const items=[{...base,category_id:'transportation-2',amount_cents:6000,note:'Quad',tags:['grecia']},{...base,category_id:'transportation-2',amount_cents:1000,note:'Scooter',tags:['grecia']}];
  const before=(await (await call(env,'/api/transactions','POST',{request_id:'rental-category-test',transactions:items})).json()).saved;
  for(const t of before){
    const r=(await (await rpc(env,'update_expense',{transaction_id:t.id,category:'Rented vehicle'})).json()).result;
    assert(!r.isError);
  }
  const after=(await (await call(env,'/api/state')).json()).transactions;
  for(const t of before)assert.deepEqual(after.find(a=>a.id===t.id),{...t,category_id:'transportation-8'});
  assert.equal(summary(after).spending,7000);
});


test('historical category references regroup without changing records or double counting trips',async()=>{
  const env={DB:createDB()};
  const items=CATEGORIES.map((c,i)=>({...base,kind:'expense',category_id:c.id,amount_cents:100+i,tags:i%2?['Monaco']:[]}));
  await call(env,'/api/transactions','POST',{request_id:'regroup-history-1',transactions:items.slice(0,30)});
  await call(env,'/api/transactions','POST',{request_id:'regroup-history-2',transactions:items.slice(30)});
  const rows=(await (await call(env,'/api/state')).json()).transactions,before=JSON.stringify(rows);
  assert.equal(rows.length,37);
  for(const item of items){const row=rows.find(t=>t.category_id===item.category_id);for(const key of ['amount_cents','category_id','occurred_on','note','tags'])assert.deepEqual(row[key],item[key]);}
  const all=summary(rows),overview=overviewSummary(rows);
  assert.equal(Object.keys(all.groups).length,9);
  assert.equal(Object.values(all.groups).reduce((a,b)=>a+b,0),all.spending);
  assert.equal(Object.values(overview.groups).reduce((a,b)=>a+b,0),all.spending);
  assert.equal(overview.groups.trips,summary(filterRows(rows,{tag:'Monaco'})).spending);
  assert.equal(overview.groups.groceries,0===items.find(t=>t.category_id==='food-5').tags.length?items.find(t=>t.category_id==='food-5').amount_cents:undefined);
  assert.equal(JSON.stringify(rows),before);
});

test('tag rename accepts apostrophes and preserves expense details and other users',async()=>{
  const env={DB:createDB()};
  const items=[{...base,tags:['Isola d Elba'],amount_cents:2300},{...base,tags:['Summer','isola d elba'],amount_cents:700}];
  await call(env,'/api/transactions','POST',{request_id:'tag-rename-alice',transactions:items});
  await call(env,'/api/transactions','POST',{request_id:'tag-rename-bob',transactions:items},'bob');
  const before=(await (await call(env,'/api/state')).json()).transactions;
  const bobBefore=(await (await call(env,'/api/state','GET',null,'bob')).json()).transactions;
  const r=await call(env,'/api/tags/'+encodeURIComponent('Isola d Elba'),'PUT',{name:"Isola d'Elba"});
  assert.equal(r.status,200);
  const state=await (await call(env,'/api/state')).json();
  assert(state.tags.includes("Isola d'Elba"));assert(!state.tags.some(t=>t.toLowerCase()==='isola d elba'));
  for(const row of before)assert.deepEqual(state.transactions.find(t=>t.id===row.id),{...row,tags:row.tags.map(t=>t.toLowerCase()==='isola d elba'?"Isola d'Elba":t)});
  assert.equal(summary(state.transactions).spending,3000);
  assert.deepEqual((await (await call(env,'/api/state','GET',null,'bob')).json()).transactions,bobBefore);
  const listed=(await (await rpc(env,'list_transactions',{tag:"Isola d'Elba"})).json()).result.structuredContent;assert.equal(listed.total,2);
  await call(env,'/api/tags','POST',{name:'Existing'});
  assert.equal((await call(env,'/api/tags/'+encodeURIComponent("Isola d'Elba"),'PUT',{name:'Existing'})).status,400);
  assert.equal((await call(env,'/api/tags/'+encodeURIComponent("Isola d'Elba"),'PUT',{name:'<unsafe>'})).status,400);
});

test('only unused tags can be removed and all tag edits require owner identity',async()=>{
  const env={DB:createDB()};
  await call(env,'/api/tags','POST',{name:'monaco'});
  await call(env,'/api/tags','POST',{name:'monaco'},'bob');
  assert.equal((await call(env,'/api/tags/monaco','DELETE',null,null)).status,401);
  assert.equal((await call(env,'/api/tags/monaco','PUT',{name:'New'},null)).status,401);
  assert.equal((await call(env,'/api/tags/monaco','DELETE',null,'alice',{origin:'https://other.test'})).status,403);
  await call(env,'/api/transactions','POST',{request_id:'tag-protected-expense',transactions:[base]});
  assert.equal((await call(env,'/api/tags/Roma','DELETE')).status,400);
  assert.equal((await call(env,'/api/tags/monaco','DELETE')).status,200);
  const state=await (await call(env,'/api/state')).json();assert.deepEqual(state.tags,['Roma']);assert.equal(state.transactions.length,1);
  assert.deepEqual((await (await call(env,'/api/state','GET',null,'bob')).json()).tags,['monaco']);
});

 test('Drinks migration preserves every payment and makes legacy retries idempotent',async()=>{
  const env={DB:createDB()};
  await call(env,'/api/transactions','POST',{request_id:'merge-drinks-test',transactions:[{...base,category_id:'food-2',amount_cents:800},{...base,category_id:'entertainment-0',amount_cents:11840}]});
  env.DB.sql.exec("UPDATE transactions SET category_id='food-2' WHERE amount_cents=800");
  const before=env.DB.sql.prepare('SELECT * FROM transactions ORDER BY id').all();
  const migration=readFileSync(new URL('../drizzle/0003_merge_drinks.sql',import.meta.url),'utf8');
  env.DB.sql.exec(migration);env.DB.sql.exec(migration);
  const after=env.DB.sql.prepare('SELECT * FROM transactions ORDER BY id').all();
  assert.deepEqual(after.map(t=>({...t})),before.map(t=>({...t,category_id:'entertainment-0'})));
  const retry=await call(env,'/api/transactions','POST',{request_id:'merge-drinks-test',transactions:[{...base,category_id:'food-2',amount_cents:800},{...base,category_id:'entertainment-0',amount_cents:11840}]});
  assert.equal(retry.status,201);
  const rows=(await (await call(env,'/api/state')).json()).transactions;
  assert.equal(rows.length,2);assert.equal(summary(rows).categories['entertainment-0'],12640);
  assert.equal(overviewSummary(rows).groups.trips,12640);
 });
