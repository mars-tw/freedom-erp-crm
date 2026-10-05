import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {normalizeLaunchConfig} from '../bin/launch-config.mjs';
import {buildLaunchKit,launchKitFiles,launchConfigText,setupCommand} from '../web/launch-kit';

const catalog=JSON.parse(readFileSync('templates/catalog.json','utf8')),schema=readFileSync('bin/launch-config.mjs','utf8');
const config=normalizeLaunchConfig({format:'freedom-erp-launch-v1',industry:'manufacturing',company_name:'工廠 $() `literal` & "引號"',modules:['inventory','wallets','manufacturing'],port:'auto',directory:'./我的 測試資料',auto_setup:true,simulation:true,real_finance:false},catalog);
mkdirSync('.audit-tmp/launch-kit-tests',{recursive:true});const temp=mkdtempSync(resolve('.audit-tmp/launch-kit-tests/case-'));

test('generated ZIP is accepted by an independent archive reader with exact UTF-8 plan and executable shell mode',()=>{
 const path=join(temp,'kit.zip');writeFileSync(path,buildLaunchKit(config,schema));
 const code="import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(json.dumps({'files':z.namelist(),'config':json.loads(z.read('freedom-launch.json')),'shell_mode':z.getinfo('start.sh').external_attr>>16}))";
 const result=spawnSync('python',['-c',code,path],{encoding:'utf8',shell:false,timeout:10000});assert.equal(result.status,0,result.stderr);const data=JSON.parse(result.stdout);assert.equal(data.files.length,7);assert.deepEqual(data.config,config);assert.equal(data.shell_mode,0o100755);assert.ok(data.files.every((name:string)=>!name.includes('..')&&!name.includes('/')&&!name.includes('\\')));
});
test('names remain JSON data and never enter shell code or execution arguments',()=>{
 const files=launchKitFiles(config,schema);for(const name of ['start.cmd','start.sh','launch.mjs','launch-schema.mjs'])assert.equal(files[name].includes(config.company_name),false);
 assert.match(files['start.cmd'],/DisableDelayedExpansion/);assert.doesNotMatch(files['start.cmd'],/\bcall\b|ExecutionPolicy|EncodedCommand/i);assert.match(files['launch.mjs'],/shell:false/);assert.equal(setupCommand(config),'npx --yes github:mars-tw/freedom-erp-crm --config ./freedom-launch.json --open');assert.deepEqual(JSON.parse(launchConfigText(config)),config);
});
test('an extracted starter checks the actual runtime without creating or launching a workspace',()=>{
 const dir=join(temp,'預檢 & 空白');mkdirSync(dir);for(const [name,text]of Object.entries(launchKitFiles(config,schema)))writeFileSync(join(dir,name),text,{flag:'wx'});
 const result=spawnSync(process.execPath,[join(dir,'launch.mjs'),'--check'],{cwd:dir,encoding:'utf8',shell:false,timeout:15000});assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).ready,true);assert.equal(existsSync(join(dir,config.directory)),false);
});
test('missing Git and malformed launch plans fail preflight before npx or workspace creation',()=>{
 const dir=join(temp,'invalid');mkdirSync(dir);for(const [name,text]of Object.entries(launchKitFiles(config,schema)))writeFileSync(join(dir,name),text,{flag:'wx'});
 const missing=spawnSync(process.execPath,[join(dir,'launch.mjs'),'--check'],{cwd:dir,encoding:'utf8',shell:false,timeout:15000,env:{...process.env,PATH:''}});assert.notEqual(missing.status,0);assert.match(missing.stderr,/Git is required/);assert.equal(existsSync(join(dir,config.directory)),false);
 writeFileSync(join(dir,'freedom-launch.json'),JSON.stringify({...config,directory:'../outside'}));const bad=spawnSync(process.execPath,[join(dir,'launch.mjs'),'--check'],{cwd:dir,encoding:'utf8',shell:false,timeout:15000});assert.notEqual(bad.status,0);assert.equal(existsSync(join(dir,config.directory)),false);
});
