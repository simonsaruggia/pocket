import json,urllib.request,urllib.error,datetime
from pathlib import Path
base='https://pocket-production-e3d7.up.railway.app';secret=dict(l.split('=',1) for l in Path('.env.railway').read_text().splitlines())
req=urllib.request.Request(base+'/session',data=json.dumps({'key':secret['POCKET_ACCESS_KEY']}).encode(),headers={'Content-Type':'application/json','Origin':base})
with urllib.request.urlopen(req) as res:cookie=res.headers['Set-Cookie'].split(';')[0]
headers={'Content-Type':'application/json','Origin':base,'Cookie':cookie,'x-pocket-client':'1'}
def get(path):
 with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers),timeout=90) as r:return json.load(r)
before=get('/admin/report')
body={'text':'18 euro lunch in Helsinki today','date':'2026-11-08','chat':True,'messages':[]}
with urllib.request.urlopen(urllib.request.Request(base+'/api/expenses/preview',data=json.dumps(body).encode(),headers=headers),timeout=90) as r:data=json.load(r)
assert data['transactions'][0]['amount_cents']==1800,data
assert data['transactions'][0]['category_id']=='food-6',data
assert 'Helsinki' in data['transactions'][0]['tags'],data
assert before['transactions']==get('/admin/report')['transactions']
print('Live GPT draft verified: EUR18, Restaurants, Helsinki; no expense saved.')
