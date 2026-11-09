import {spawnSync} from 'node:child_process';
import {createInterface} from 'node:readline';
// Fallback transport for environments where the Sites source helper is not installed.
// Credentials arrive only over hidden stdin and remain in process memory.
if(process.stdin.isTTY)spawnSync('stty',['-echo'],{stdio:'inherit'});
console.log('Ready for Site workflow JSON on stdin (input is hidden).');
const rl=createInterface({input:process.stdin,crlfDelay:Infinity});
const line=await new Promise(resolve=>rl.once('line',resolve));rl.close();
const {credential}=JSON.parse(line);
if(credential.auth_mode!=='http_extra_header')throw new Error('Unsupported credential mode.');
const gitEnv={...process.env,GIT_TERMINAL_PROMPT:'0'};
const n=Number(gitEnv.GIT_CONFIG_COUNT||0);
gitEnv.GIT_CONFIG_COUNT=String(n+1);gitEnv['GIT_CONFIG_KEY_'+n]='http.'+credential.remote_url+'.extraHeader';gitEnv['GIT_CONFIG_VALUE_'+n]='Authorization: Bearer '+credential.token;
function run(cmd,args,env=process.env){const r=spawnSync(cmd,args,{env,encoding:'utf8',timeout:60000});if(r.status!==0){const message=String(r.stderr||r.error||'Command failed').split(credential.token).join('[redacted]');throw new Error(message);}return r.stdout.trim();}
if(spawnSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).stdout.trim()!==process.cwd())run('git',['init','-b','main']);
run('git',['config','user.name','Codex']);run('git',['config','user.email','codex@users.noreply.openai.com']);
if(spawnSync('git',['remote','get-url','origin'],{encoding:'utf8'}).status===0)run('git',['remote','set-url','origin',credential.remote_url]);else run('git',['remote','add','origin',credential.remote_url]);
if(process.argv.includes('--open')){
  run('git',['fetch','origin',credential.branch],gitEnv);
  run('git',['merge','--ff-only','FETCH_HEAD']);
  console.log(JSON.stringify({checkout_path:process.cwd(),commit_sha:run('git',['rev-parse','HEAD'])}));
  process.exit(0);
}
run('git',['add','.']);
if(spawnSync('git',['diff','--cached','--quiet']).status!==0)run('git',['commit','-m','Make Pocket expenses-only']);
const sha=run('git',['rev-parse','HEAD']);
run('git',['push','origin','HEAD:refs/heads/'+credential.branch],gitEnv);
const remote=run('git',['ls-remote','origin','refs/heads/'+credential.branch],gitEnv).split(/\s+/)[0];
if(remote!==sha)throw new Error('Source revision verification failed.');
run('tar',['-czf','/tmp/pocket-deployment.tar.gz','.openai','dist','drizzle']);
console.log(JSON.stringify({commit_sha:sha,archive:'/tmp/pocket-deployment.tar.gz'}));
process.exit(0);
