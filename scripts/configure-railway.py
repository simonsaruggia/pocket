import subprocess,os
from pathlib import Path
env=os.environ.copy();env['PATH']='/Users/simonesaruggia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:'+env.get('PATH','')
for line in Path('.env.railway').read_text().splitlines():
 key,value=line.split('=',1)
 r=subprocess.run(['/tmp/pocket-railway-cli/node_modules/.bin/railway','variable','set',key,'--stdin','--skip-deploys','--project','593a3524-9acb-450e-9904-2f6704b661c3','--environment','5e9adda7-ce53-407b-ba32-2ba535ee69b7','--service','d67cba8a-6c6f-455e-b838-9efb33aa5407'],input=value,text=True,capture_output=True,env=env)
 if r.returncode:print('Failed setting '+key);raise SystemExit(1)
 print('Configured '+key)
