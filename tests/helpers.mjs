import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function createDB(filename=':memory:'){
  const sql=new DatabaseSync(filename);for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  return {sql,prepare(query){return {query,values:[],bind(...values){this.values=values;return this;},async all(){return {results:sql.prepare(query).all(...this.values)};},async first(){return sql.prepare(query).get(...this.values)||null;},async run(){const result=sql.prepare(query).run(...this.values);return {success:true,meta:{changes:result.changes}};}};},async batch(stmts){sql.exec('BEGIN');try{const out=[];for(const s of stmts)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
}
