import json,urllib.request,urllib.error,sys
from pathlib import Path
base=sys.argv[1].rstrip('/'); secret=dict(l.split('=',1) for l in Path('.env.railway').read_text().splitlines()); snapshot=json.loads(Path('private/export.json').read_text()); cookie=''
def request(path,method='GET',body=None,extra={}):
 headers={'Content-Type':'application/json','Origin':base.replace('http:','https:'),'Cookie':cookie,**extra};data=None if body is None else json.dumps(body).encode();req=urllib.request.Request(base+path,data=data,method=method,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=90) as res:return res.status,res.headers,res.read()
 except urllib.error.HTTPError as e:return e.code,e.headers,e.read()
assert request('/api/state')[0]==401
assert request('/api/state',extra={'oai-authenticated-user-id':secret['POCKET_OWNER_ID']})[0]==401
assert request('/session','POST',{'key':'bad'})[0]==401
status,headers,_=request('/session','POST',{'key':secret['POCKET_ACCESS_KEY']});assert status==204;cookie=headers['Set-Cookie'].split(';')[0]
status,_,body=request('/admin/import','POST',snapshot,{'Authorization':'Bearer '+secret['POCKET_IMPORT_KEY']});assert status in (200,409,404),(status,body)
status,_,body=request('/api/state');assert status==200;state=json.loads(body)
expected={r['id']:r for r in snapshot['transactions'] if r['kind']=='expense'}
assert len(state['transactions'])==len(expected)
for t in state['transactions']:
 r=expected[t['id']]
 for k in ['amount_cents','kind','category_id','occurred_on','note','created_at']:assert t[k]==r[k],(t['id'],k)
 assert t['tags']==json.loads(r['tags'])
assert set(state['tags'])=={t['name'] for t in snapshot['tags']}
assert sorted((b['month'],b['amount_cents']) for b in state['budgets'])==sorted((b['month'],b['amount_cents']) for b in snapshot['budgets'])
assert request('/admin/import','POST',snapshot,{'Authorization':'Bearer '+secret['POCKET_IMPORT_KEY']})[0] in (409,404)
assert request('/api/budget','PUT',{'month':'2026-11','amount_cents':1},{'Origin':'https://attacker.example','x-pocket-client':'1'})[0]==403
assert json.loads(request('/manifest.webmanifest')[2])['display']=='standalone'
assert request('/icon-192.png')[0]==200
print(json.dumps({'verified_transactions':len(expected),'total_eur':sum(r['amount_cents'] for r in expected.values())/100,'tags':len(state['tags']),'budgets':len(state['budgets']),'access_checks':'passed','duplicate_import':'blocked'}))
