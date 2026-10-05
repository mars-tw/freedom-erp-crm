import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync,symlinkSync,statSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
import {normalizeLaunchConfig} from '../bin/launch-config.mjs';

const root=resolve('.'),cli=join(root,'bin/freedom-erp.mjs');
const catalog=JSON.parse(readFileSync(join(root,'templates/catalog.json'),'utf8'));
mkdirSync('.audit-tmp/release-validation',{recursive:true});
const temp=mkdtempSync(resolve('.audit-tmp/release-validation/qs-'));
const raw={format:'freedom-erp-launch-v1',industry:'retail',company_name:'店名 "引號" $() & `literal` 中文'};
function run(args,cwd=temp){return spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:10000,shell:false});}
function fixture(name,overrides={}){const folder=join(temp,name);mkdirSync(folder);const path=join(folder,'launch.json');writeFileSync(path,JSON.stringify({...raw,...overrides})+'\n','utf8');return {path,folder,directory:join(folder,overrides.directory??'freedom-data')};}
function parsed(result){assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());}
function snapshot(paths){return paths.map(path=>({path,bytes:readFileSync(path),mtime:statSync(path).mtimeMs}));}
function unchanged(before){for(const value of before){assert.deepEqual(readFileSync(value.path),value.bytes,value.path);assert.equal(statSync(value.path).mtimeMs,value.mtime,value.path);}}

test('shared launch schema normalizes all eight profiles without changing catalog or accepting arbitrary fields',()=>{
 for(const template of catalog.templates){const value=normalizeLaunchConfig({...raw,industry:template.id},catalog);assert.deepEqual(value.modules,template.modules);assert.equal(value.port,'auto');assert.equal(value.directory,'./freedom-data');assert.equal(value.auto_setup,true);assert.equal(value.simulation,true);assert.equal(value.real_finance,false);value.modules.push('invalid');assert.ok(!template.modules.includes('invalid'));}
 const invalid=[null,[],{},...[
  {format:'different'}, {industry:'unsupported'}, {company_name:''}, {company_name:'bad\nname'}, {company_name:'bad\u007fname'}, {company_name:'x'.repeat(101)},
  {modules:[]},{modules:['crm','crm']},{modules:['unknown']},{modules:['sales']},{modules:'crm'},
  {port:'8788'},{port:1023},{port:65536},{port:8788.5},{port:false},
  {directory:'../elsewhere'},{directory:'sub/../elsewhere'},{directory:'sub\\..\\elsewhere'},{directory:'C:\\target'},{directory:'/tmp/data'},{directory:'\\\\host\\share'},{directory:'C:relative'},{directory:'bad\npath'},
  {auto_setup:'true'},{auto_setup:null},{simulation:false},{simulation:'true'},{real_finance:true},{real_finance:0},{hooks:[]},{command:'echo test'},{repository:'other/repo'},
 ].map(change=>({...raw,...change}))];
 for(const value of invalid)assert.throws(()=>normalizeLaunchConfig(value,catalog),JSON.stringify(value));
 assert.deepEqual(normalizeLaunchConfig({...raw,modules:['crm'],auto_setup:false,port:8901,directory:'./自訂 資料'},catalog).modules,['crm']);
});
test('config paths anchor data beside JSON regardless of cwd, retain literal names, and enable selfhost auto setup',()=>{
 const f=fixture('config has spaces',{directory:'./獨立 資料'}),output=parsed(run(['--config',f.path,'--dry-run'],root));
 assert.equal(output.directory,f.directory);assert.equal(output.company_name,raw.company_name);assert.equal(output.auto_setup,true);assert.equal(output.profile,join(f.directory,'instance.json'));assert.ok(Number.isInteger(output.port));
 const config=JSON.parse(readFileSync(join(f.directory,'wrangler.json'),'utf8'));assert.equal(config.vars.DEFAULT_COMPANY,raw.company_name);assert.equal(config.vars.PUBLIC_DEMO,'false');assert.equal(config.vars.AUTO_SETUP,'true');assert.equal(existsSync(output.storage),false);assert.equal(existsSync(join(f.directory,'.freedom-runtime.lock')),false);assert.equal(existsSync(join(f.directory,'.freedom-start.lock')),false);
});
test('config validation and incompatible override flags leave no data directory',()=>{
 for(const [index,change] of [{real_finance:true},{simulation:false},{hooks:[]},{company_name:'bad\nname'},{directory:'../outside'},{modules:['services','crm']},{auto_setup:1}].entries()){const f=fixture('invalid-'+index,change);assert.notEqual(run(['--config',f.path,'--dry-run']).status,0);assert.equal(existsSync(join(f.folder,'freedom-data')),false);}
 for(const [index,flag] of ['industry','name','modules','directory','port'].entries()){const f=fixture('mixed-'+index);assert.notEqual(run(['--config',f.path,'--'+flag,'retail','--dry-run']).status,0);assert.equal(existsSync(f.directory),false);}
 for(const [index,args] of [['--open=true'],['--doctor=false'],['--config'],['--config','missing.json'],['--config','missing.json','--config','missing.json']].entries()){assert.notEqual(run(args).status,0,'invalid '+index);}
 const broken=fixture('broken-json');writeFileSync(broken.path,'not JSON');assert.notEqual(run(['--config',broken.path,'--dry-run']).status,0);assert.equal(existsSync(broken.directory),false);
});
test('exact config resume preserves manifest/runtime bytes, mtimes, SQLite sentinel and port',()=>{
 const f=fixture('resume'),first=parsed(run(['--config',f.path,'--dry-run']));mkdirSync(join(f.directory,'state'));writeFileSync(join(f.directory,'state','sqlite-sentinel'),'persistent simulation data');
 const before=snapshot(['instance.json','wrangler.json','state/sqlite-sentinel'].map(path=>join(f.directory,path)));assert.deepEqual(parsed(run(['--config',f.path,'--dry-run'])),first);unchanged(before);
});
test('auto port moves past occupied previous port and numeric port refuses occupied service without killing it',async()=>{
 const f=fixture('port-auto'),first=parsed(run(['--config',f.path,'--dry-run']));mkdirSync(join(f.directory,'state'));writeFileSync(join(f.directory,'state','keep'),'keep');const data=snapshot([join(f.directory,'state','keep'),join(f.directory,'wrangler.json')]);
 const occupied=createServer();await new Promise((done,reject)=>{occupied.once('error',reject);occupied.listen(first.port,'127.0.0.1',done);});
 try{
  const numeric=run(['--name','numeric occupied','--directory',join(temp,'numeric-occupied'),'--port',String(first.port),'--doctor']);assert.notEqual(numeric.status,0);assert.match(numeric.stderr,/已在使用/);assert.equal(existsSync(join(temp,'numeric-occupied')),false);assert.equal(occupied.listening,true);
  const next=parsed(run(['--config',f.path,'--dry-run']));assert.ok(next.port>first.port);assert.equal(JSON.parse(readFileSync(join(f.directory,'instance.json'),'utf8')).port,next.port);assert.equal(occupied.listening,true);unchanged(data);
  const before=snapshot([join(f.directory,'instance.json')]);assert.equal(parsed(run(['--config',f.path,'--dry-run'])).port,next.port);unchanged(before);
 }finally{await new Promise(done=>occupied.close(done));}
});
test('managed runtime paths refresh after package cache moves, preserving data and profile identity',()=>{
 const f=fixture('cache-move');parsed(run(['--config',f.path,'--dry-run']));mkdirSync(join(f.directory,'state'));writeFileSync(join(f.directory,'state','keep'),'keep');const untouched=snapshot([join(f.directory,'instance.json'),join(f.directory,'state','keep')]);
 const configPath=join(f.directory,'wrangler.json'),config=JSON.parse(readFileSync(configPath,'utf8')),oldRoot=join(temp,'old npm cache package');config.main=join(oldRoot,'src','worker.ts');config.assets.directory=join(oldRoot,'dist');writeFileSync(configPath,JSON.stringify(config));
 parsed(run(['--config',f.path,'--dry-run']));const renewed=JSON.parse(readFileSync(configPath,'utf8'));assert.equal(renewed.main,join(root,'src','worker.ts'));assert.equal(renewed.assets.directory,join(root,'dist'));unchanged(untouched);
 const before=snapshot([configPath]);parsed(run(['--config',f.path,'--dry-run']));unchanged(before);
});
test('malformed profiles, manual runtime mismatches, linked managed paths and nonempty stores remain untouched',()=>{
 for(const [index,mutate] of [p=>({...p,auto_setup:null}),p=>({...p,simulation:false}),p=>({...p,real_finance:true}),p=>({...p,port:'auto'}),p=>({...p,hooks:[]}),p=>({...p,company_name:'different'}),p=>({...p,modules:['crm']})].entries()){
  const f=fixture('manual-profile-'+index);parsed(run(['--config',f.path,'--dry-run']));const profile=join(f.directory,'instance.json');writeFileSync(profile,JSON.stringify(mutate(JSON.parse(readFileSync(profile,'utf8')))));const before=snapshot([profile,join(f.directory,'wrangler.json')]);assert.notEqual(run(['--config',f.path,'--dry-run']).status,0);unchanged(before);
 }
 const manual=fixture('manual-runtime');parsed(run(['--config',manual.path,'--dry-run']));const runtime=join(manual.directory,'wrangler.json'),cfg=JSON.parse(readFileSync(runtime,'utf8'));cfg.vars.PUBLIC_DEMO='true';writeFileSync(runtime,JSON.stringify(cfg));const manualBefore=snapshot([runtime,join(manual.directory,'instance.json')]);assert.notEqual(run(['--config',manual.path,'--dry-run']).status,0);unchanged(manualBefore);
 const busy=fixture('owner-files');mkdirSync(busy.directory);writeFileSync(join(busy.directory,'owner'),'owner');assert.notEqual(run(['--config',busy.path,'--dry-run']).status,0);assert.deepEqual(readdirSync(busy.directory),['owner']);
 const target=join(temp,'linked-target');mkdirSync(target);writeFileSync(join(target,'owner'),'owner');
 const link=fixture('linked-directory');symlinkSync(target,link.directory,process.platform==='win32'?'junction':'dir');assert.notEqual(run(['--config',link.path,'--dry-run']).status,0);assert.deepEqual(readdirSync(target),['owner']);
 const state=fixture('linked-storage');parsed(run(['--config',state.path,'--dry-run']));symlinkSync(target,join(state.directory,'state'),process.platform==='win32'?'junction':'dir');assert.notEqual(run(['--config',state.path,'--dry-run']).status,0);assert.deepEqual(readdirSync(target),['owner']);
});
test('owned live PID lease refuses concurrent instance while dead lease safely recovers',()=>{
 const f=fixture('lease');parsed(run(['--config',f.path,'--dry-run']));const lock=join(f.directory,'.freedom-runtime.lock');writeFileSync(lock,JSON.stringify({pid:process.pid,token:randomUUID()})+'\n');const live=snapshot([lock,join(f.directory,'instance.json')]);const conflict=run(['--config',f.path,'--dry-run']);assert.notEqual(conflict.status,0);assert.match(conflict.stderr,/已在執行/);unchanged(live);
 let deadPid=2147483646;for(;;deadPid--){try{process.kill(deadPid,0);}catch(e){if(e.code==='ESRCH')break;}}
 writeFileSync(lock,JSON.stringify({pid:deadPid,token:randomUUID()})+'\n');parsed(run(['--config',f.path,'--dry-run']));assert.equal(existsSync(lock),false);assert.equal(existsSync(join(f.directory,'.freedom-start.lock')),false);
 const guard=join(f.directory,'.freedom-start.lock');writeFileSync(guard,'owner guard');const original=snapshot([guard]);assert.notEqual(run(['--config',f.path,'--dry-run']).status,0);unchanged(original);
});
test('doctor is read-only for new and existing config stores',()=>{
 const f=fixture('doctor');const newResult=parsed(run(['--config',f.path,'--doctor']));assert.equal(newResult.doctor,true);assert.equal(newResult.ready,false);assert.equal(newResult.checks.ui_build,true);assert.equal(newResult.checks.profile,'new');assert.equal(existsSync(f.directory),false);
 parsed(run(['--config',f.path,'--dry-run']));const before=snapshot([join(f.directory,'instance.json'),join(f.directory,'wrangler.json')]);const resume=parsed(run(['--config',f.path,'--doctor']));assert.equal(resume.checks.profile,'resume');unchanged(before);assert.equal(existsSync(join(f.directory,'state')),false);assert.equal(existsSync(join(f.directory,'.freedom-runtime.lock')),false);
});
test('Windows rejects actual long workerd storage paths before dry-run or doctor creates any directory',{skip:process.platform!=='win32'},()=>{
 const relativeDirectory='./'+['long-path-a'.repeat(7),'long-path-b'.repeat(7)].join('/');
 const f=fixture('long-path',{directory:relativeDirectory});
 const before=snapshot([f.path]);
 for(const flag of ['--dry-run','--doctor']){
  const result=run(['--config',f.path,flag]);assert.notEqual(result.status,0);assert.match(result.stderr,/workerd.*260.*較短/);assert.match(result.stderr,/尚未建立或覆寫資料/);assert.equal(existsSync(f.directory),false);assert.deepEqual(readdirSync(f.folder),['launch.json']);unchanged(before);
 }
});
