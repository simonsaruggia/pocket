import {createServer} from 'node:http';
import {createDB} from '../tests/helpers.mjs';
import worker from '../dist/server/index.js';
// Preview-only identity. This adapter is never packaged for deployment.
const env={DB:createDB(),OPENAI_API_KEY:process.env.OPENAI_API_KEY};
createServer(async(req,res)=>{try{const parts=[];for await(const c of req)parts.push(c);const headers=new Headers(req.headers);headers.set('oai-authenticated-user-id','local-preview');headers.set('oai-authenticated-user-email','preview@pocket.local');const request=new Request('http://127.0.0.1:5173'+req.url,{method:req.method,headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(parts)})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e.message);res.writeHead(500);res.end('Preview error');}}).listen(5173,'127.0.0.1',()=>console.log('Pocket preview: http://127.0.0.1:5173'));
