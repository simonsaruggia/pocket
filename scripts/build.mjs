import {readFile,mkdir,writeFile,cp,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url);const read=p=>readFile(new URL(p,root),'utf8');
const domain=await read('src/domain.js');
let server=(await read('src/server.js')).replace(/^import .*from '\.\/(domain|smart|rules|currency)\.js';\n/gm,'');
const rules=(await read('src/rules.js')).replace(/^import .*from '\.\/domain\.js';\n/,'').replace(/^export /gm,'');
const currency=(await read('src/currency.js')).replace(/^import .*from '\.\/domain\.js';\n/,'').replace(/^export /gm,'');
const smart=(await read('src/smart.js')).replace(/^import .*from '\.\/(domain|rules|currency)\.js';\n/gm,'').replace(/^export /gm,'');
for(const [key,path] of [['__POCKET_HTML__','public/index.html'],['__POCKET_CSS__','public/styles.css'],['__POCKET_CLIENT__','public/app.js'],['__POCKET_DOMAIN__','src/domain.js']]){const content=await read(path);server=server.replace("'"+key+"'",()=>JSON.stringify(content));}
await rm(new URL('dist/',root),{recursive:true,force:true});
await mkdir(new URL('dist/server/',root),{recursive:true});await mkdir(new URL('dist/.openai/',root),{recursive:true});
await writeFile(new URL('dist/server/index.js',root),domain.replace(/^export /gm,'')+'\n'+rules+'\n'+currency+'\n'+smart+'\n'+server);
await cp(new URL('.openai/hosting.json',root),new URL('dist/.openai/hosting.json',root));
await cp(new URL('drizzle/',root),new URL('dist/drizzle/',root),{recursive:true});
console.log('Built Pocket Worker and database migrations.');
