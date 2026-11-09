import {assert,validDate,cleanTag} from './domain.js';
export async function tripRules(db,user){return (await db.prepare('SELECT id,tag,starts_on,ends_on,active,revision FROM trip_rules WHERE user_id=? ORDER BY starts_on DESC,id').bind(user).all()).results;}
export function validateRuleAction(action,rules){
  assert(action&&['create','update','cancel'].includes(action.action),'Choose a valid rule change.');
  const existing=rules.find(r=>r.id===action.id);
  if(action.action!=='create')assert(existing&&existing.active,'That rule is no longer active. Please ask again.');
  const tag=cleanTag(action.action==='cancel'?existing.tag:action.tag);
  const starts_on=action.action==='cancel'?existing.starts_on:action.starts_on,ends_on=action.action==='cancel'?existing.ends_on:action.ends_on;
  assert(validDate(starts_on)&&validDate(ends_on)&&starts_on<=ends_on,'Choose a valid inclusive date range.');
  return {action:action.action,id:existing?.id||null,revision:existing?.revision||0,tag,starts_on,ends_on};
}
export async function saveTripRule(db,user,body){
  assert(typeof body.request_id==='string'&&body.request_id.length>=8&&body.request_id.length<=100,'A unique request ID is required.');
  const payload=JSON.stringify(body.rule);
  const retry=await db.prepare('SELECT * FROM trip_rules WHERE user_id=? AND request_id=?').bind(user,body.request_id).first();
  if(retry){assert(retry.request_payload===payload,'This request was already used for a different rule.');return {saved:retry.id};}
  const created=await db.prepare('SELECT id,creation_payload FROM trip_rules WHERE user_id=? AND creation_request_id=?').bind(user,body.request_id).first();
  if(created){assert(created.creation_payload===payload,'This request was already used for a different rule.');return {saved:created.id};}
  const rules=await tripRules(db,user),r=validateRuleAction(body.rule,rules);
  if(r.action==='create'){
    const id=crypto.randomUUID();
    await db.prepare('INSERT INTO trip_rules (id,user_id,tag,starts_on,ends_on,request_id,request_payload,creation_request_id,creation_payload) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,request_id) DO NOTHING').bind(id,user,r.tag,r.starts_on,r.ends_on,body.request_id,payload,body.request_id,payload).run();
    const saved=await db.prepare('SELECT id,request_payload FROM trip_rules WHERE user_id=? AND request_id=?').bind(user,body.request_id).first();assert(saved.request_payload===payload,'Request already used.');return {saved:saved.id};
  }
  assert(body.rule.revision===r.revision,'This rule changed since your review. Please ask again.');
  const result=await db.prepare('UPDATE trip_rules SET tag=?,starts_on=?,ends_on=?,active=?,revision=revision+1,request_id=?,request_payload=? WHERE user_id=? AND id=? AND revision=?').bind(r.tag,r.starts_on,r.ends_on,r.action==='cancel'?0:1,body.request_id,payload,user,r.id,r.revision).run();
  assert(result.meta.changes===1,'This rule changed since your review. Please ask again.');return {saved:r.id};
}
export function applyTripRules(transactions,rules,defaultTag=''){
  for(const t of transactions){
    if(t.tag_mode==='none'){t.tags=[];continue;}
    if(t.tag_mode==='explicit')continue;
    if(defaultTag){t.tags=[defaultTag];continue;}
    const tags=[...new Map(rules.filter(r=>r.active&&r.starts_on<=t.occurred_on&&r.ends_on>=t.occurred_on).map(r=>[r.tag.toLowerCase(),r.tag])).values()];
    if(tags.length>1)return {question:'More than one trip rule covers '+t.occurred_on+': '+tags.join(', ')+'. Which tag should I use, or should this expense have no tag?',transactions:[]};
    t.tags=tags;
  }
  return {question:'',transactions};
}
