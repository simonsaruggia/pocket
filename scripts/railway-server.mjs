import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import worker from '../dist/server/index.js';
import {createBanking} from './banking.mjs';
const dataDir=process.env.POCKET_DATA_DIR||'/data';mkdirSync(dataDir,{recursive:true});
const access=process.env.POCKET_ACCESS_KEY,owner=process.env.POCKET_OWNER_ID;
if(!access||access.length<40||!owner)throw Error('Pocket access configuration missing');
const sql=new DatabaseSync(dataDir+'/pocket.sqlite');sql.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY);');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())if(!sql.prepare('SELECT name FROM schema_migrations WHERE name=?').get(name)){
 if(name==='0004_foreign_currency.sql'&&!existsSync(dataDir+'/pocket-before-fx.sqlite'))sql.prepare('VACUUM INTO ?').run(dataDir+'/pocket-before-fx.sqlite');
 sql.exec('BEGIN');try{sql.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));sql.prepare('INSERT INTO schema_migrations VALUES (?)').run(name);sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}
}
const DB={prepare(query){return {values:[],bind(...values){this.values=values;return this;},async all(){return {results:sql.prepare(query).all(...this.values)};},async first(){return sql.prepare(query).get(...this.values)||null;},async run(){const r=sql.prepare(query).run(...this.values);return {success:true,meta:{changes:r.changes}};}};},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const env={DB,OPENAI_API_KEY:process.env.OPENAI_API_KEY};
const banking=createBanking({sql,DB,owner,access,env});
const hash=s=>createHash('sha256').update(s||'').digest();
const equals=(a,b)=>timingSafeEqual(hash(a),hash(b));
const session=createHmac('sha256',access).update('pocket-device-session-v1').digest('hex');
const allowedTables=['transactions','tags','budgets','trip_rules','smart_requests'];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
function report(){return Object.fromEntries(allowedTables.map(t=>[t,{count:sql.prepare('SELECT count(*) n FROM '+t).get().n,...(t==='transactions'?{total_cents:sql.prepare('SELECT coalesce(sum(amount_cents),0) n FROM transactions').get().n}: {})}]))}
const bootstrap=`const key=new URLSearchParams(location.hash.slice(1)).get('key');if(key){history.replaceState(null,'','/');fetch('/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})}).then(r=>{if(!r.ok)throw Error();location.replace('/')}).catch(()=>document.querySelector('p').textContent='This private link is not valid.')}else document.querySelector('p').textContent='Open Pocket using your private access link.';`;
async function handle(req){
 const url=new URL(req.url),path=url.pathname;
 if(['/privacy','/terms'].includes(path)&&req.method==='GET')return new Response(readFileSync(new URL('../public'+path+'.html',import.meta.url)),{headers:{'content-type':'text/html; charset=utf-8'}});
 if(path==='/banking.css'&&req.method==='GET')return new Response(readFileSync(new URL('../public/banking.css',import.meta.url)),{headers:{'content-type':'text/css'}});
 if(path==='/banking/callback'&&req.method==='GET')return banking.callback(req);
 if(path==='/healthz')return json({ok:true});
 if(path==='/bootstrap.js')return new Response(bootstrap,{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(path==='/session'&&req.method==='POST'){
 if(req.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
 const body=await req.json();if(!equals(body.key,access))return json({error:'Invalid link'},401);
 return new Response(null,{status:204,headers:{'set-cookie':'pocket_session='+session+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=31536000','cache-control':'no-store'}});
 }
 if(path==='/admin/import'&&req.method==='POST'){
 if(!process.env.POCKET_IMPORT_KEY||!equals(req.headers.get('authorization'),'Bearer '+process.env.POCKET_IMPORT_KEY))return json({error:'Not found'},404);
 if(sql.prepare('SELECT count(*) n FROM transactions').get().n)return json({error:'Import already completed'},409);
 const data=await req.json();sql.exec('BEGIN');try{for(const table of allowedTables){
 if(!Array.isArray(data[table]))throw Error('Missing table');
 const columns=sql.prepare('PRAGMA table_info('+table+')').all().map(c=>c.name);
 for(const row of data[table]){if(row.user_id!==owner||Object.keys(row).some(k=>!columns.includes(k)))throw Error('Invalid import');const fields=columns.filter(c=>Object.hasOwn(row,c));sql.prepare('INSERT INTO '+table+' ('+fields.join(',')+') VALUES ('+fields.map(()=>'?').join(',')+')').run(...fields.map(k=>row[k]));}
 }sql.exec("UPDATE transactions SET category_id='entertainment-0' WHERE category_id='food-2'");sql.exec('COMMIT');return json(report());}catch(e){sql.exec('ROLLBACK');return json({error:e.message},400);}
 }
 const cookie=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('pocket_session='))?.slice(15);
 if(!equals(cookie,session)){
 if(path!=='/'||req.method!=='GET')return json({error:'Open your private Pocket link'},401);
 return new Response('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pocket</title><body style="font:18px system-ui;padding:10%;background:#f5f7fb;color:#20304a"><h1>Pocket</h1><p>Opening your Pocket…</p><script src="/bootstrap.js"></script></body></html>',{headers:{'content-type':'text/html','cache-control':'no-store','referrer-policy':'no-referrer'}});
 }
 if(path==='/banking'&&req.method==='GET')return new Response(readFileSync(new URL('../public/banking.html',import.meta.url)),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
 if(path==='/banking.js'&&req.method==='GET')return new Response(readFileSync(new URL('../public/banking.js',import.meta.url)),{headers:{'content-type':'text/javascript','cache-control':'no-store'}});
 if(path.startsWith('/api/bank/'))return banking.route(req);
 if(path==='/admin/report')return json(report());
 if(path==='/mcp'||path.startsWith('/.well-known/'))return json({error:'Not found'},404);
 if(path==='/api/expenses/preview'){
 const month=new Date().toISOString().slice(0,7)+'-01T00:00:00Z';
 if(sql.prepare('SELECT count(*) n FROM smart_requests WHERE user_id=? AND created_at>=?').get(owner,Date.parse(month)).n>=300)return json({error:'This month’s 300 AI requests have been used. You can still enter expenses manually.'},429);
 }
 if(path==='/manifest.webmanifest')return json({id:'/',name:'Pocket',short_name:'Pocket',start_url:'/',scope:'/',display:'standalone',background_color:'#F5F7FB',theme_color:'#3478F6',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]});
 if(['/icon-192.png','/icon-512.png','/apple-touch-icon.png'].includes(path))return new Response(readFileSync(new URL('../public'+path,import.meta.url)),{headers:{'content-type':'image/png'}});
 const headers=new Headers(req.headers);for(const key of [...headers.keys()])if(key.startsWith('oai-'))headers.delete(key);headers.set('oai-authenticated-user-id',owner);
 return worker.fetch(new Request(req,{headers}),env);
}
export const server=createServer(async(req,res)=>{
 try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5_000_000){res.writeHead(413);res.end('Too large');return;}chunks.push(chunk);}
 const host=req.headers.host;if(!host||!/^[a-zA-Z0-9.:-]+$/.test(host)){res.writeHead(400);res.end();return;}
 const request=new Request('https://'+host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
 const response=await handle(request);const headers=Object.fromEntries(response.headers);headers['x-robots-tag']='noindex, nofollow';headers['referrer-policy']='no-referrer';headers['x-content-type-options']='nosniff';res.writeHead(response.status,headers);res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){console.error('Pocket request failed:',e.name);res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"Please try again."}');}
});
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Pocket ready'));

setInterval(()=>banking.tick(),60000).unref();
