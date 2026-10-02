import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,existsSync,symlinkSync,statSync} from 'node:fs';
import {resolve,join,isAbsolute} from 'node:path';
import {templates} from '../src/templates.ts';
const root=resolve('.'),cli=join(root,'bin/freedom-erp.mjs');
mkdirSync('.audit-tmp/release-validation',{recursive:true});
const temp=mkdtempSync(resolve('.audit-tmp/release-validation/cli-'));
function run(args,cwd=temp){return spawnSync(process.execPath,[cli,...args],{cwd,encoding:'utf8',timeout:10000,shell:false});}
function create(directory,industry='retail',name='名稱 含有 空白',extra=[]){return run(['--industry',industry,'--name',name,'--directory',directory,'--dry-run',...extra]);}
function json(result){assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());}
test('all eight profiles create independent valid instances using actual Node 24 and literal names',()=>{
 assert.ok(Number(process.versions.node.split('.')[0])>=24);assert.equal(templates.length,8);
 const names=['小晴 商店','Wholesale team with spaces','服務工作室','餐廳 & 早餐','工廠 $(echo fake)','店名 `literal` ; & echo','專案 "quoted" 公司','一般企業 emoji 🌱'];
 const paths=new Set();for(const [i,t] of templates.entries()){
  const directory=join(temp,t.id+' space');const out=json(create(directory,t.id,names[i]));assert.equal(out.company_name,names[i]);assert.equal(out.industry,t.id);assert.deepEqual(out.modules,t.modules);assert.equal(out.simulation,true);assert.equal(out.real_finance,false);assert.ok(isAbsolute(out.directory));assert.equal(out.storage,join(directory,'state'));assert.equal(out.url,'http://127.0.0.1:8788');assert.ok(!paths.has(out.storage));paths.add(out.storage);
  const manifest=JSON.parse(readFileSync(join(directory,'instance.json'),'utf8'));assert.equal(manifest.format,'freedom-erp-instance-v1');assert.equal(manifest.company_name,names[i]);const cfg=JSON.parse(readFileSync(join(directory,'wrangler.json'),'utf8'));assert.equal(cfg.main,join(root,'src','worker.ts'));assert.equal(cfg.assets.directory,join(root,'dist'));assert.equal(cfg.vars.DEFAULT_COMPANY,names[i]);assert.equal(cfg.vars.DEFAULT_MODULES,t.modules.join(','));assert.equal(cfg.vars.PUBLIC_DEMO,'false');assert.equal(existsSync(join(directory,'state')),false,'dry run must not start storage/server');
 }
});
test('equals syntax, deterministic defaults and module selection are accepted without starting a server',()=>{
 const out=json(run(['--industry=service','--name=Studio Chinese 中文','--modules=crm,wallets,services','--port=8899','--dry-run']));assert.equal(out.company_name,'Studio Chinese 中文');assert.deepEqual(out.modules,['crm','wallets','services']);assert.equal(out.url,'http://127.0.0.1:8899');assert.ok(out.directory.startsWith(join(temp,'.freedom-instance','service-')));assert.deepEqual(json(run(['--industry=service','--name=Studio Chinese 中文','--modules=crm,wallets,services','--port=8899','--dry-run'])),out);
});
test('invalid industries, modules, dependencies, duplicate and unknown flags, ports and missing values create no directory',()=>{
 const bad=[['--industry','does-not-exist'],['--modules','crm,unknown'],['--modules','crm,crm'],['--modules','sales'],['--modules','manufacturing,inventory'],['--modules','services,crm'],['--modules',''],['--port','1023'],['--port','65536'],['--port','8788.5'],['--port','no'],['--industry','retail','--industry=service'],['--dry-run','--dry-run'],['--unknown','abc'],['--industry'],['--name',''],['--name','bad\nname'],['--name','x'.repeat(121)],['--dry-run=true'],['--help=false']];
 for(const [i,args] of bad.entries()){const directory=join(temp,'invalid-'+i);const result=run(['--directory',directory,...args,...(args.includes('--dry-run')||args.includes('--dry-run=true')?[]:['--dry-run'])]);assert.notEqual(result.status,0,JSON.stringify(args));assert.equal(existsSync(directory),false,JSON.stringify(args));}
});
test('exact resume preserves configuration bytes, mtimes and independent state',()=>{
 const directory=join(temp,'resume');const out=json(create(directory));mkdirSync(join(directory,'state'));writeFileSync(join(directory,'state','sentinel'),'simulated persistent state');const paths=['instance.json','wrangler.json','state/sentinel'].map(p=>join(directory,p));const bytes=paths.map(p=>readFileSync(p)),times=paths.map(p=>statSync(p).mtimeMs);assert.deepEqual(json(create(directory)),out);for(const [i,p] of paths.entries()){assert.deepEqual(readFileSync(p),bytes[i]);assert.equal(statSync(p).mtimeMs,times[i]);}
});
test('incompatible existing configurations and nonempty or malformed directories are never overwritten',()=>{
 const directory=join(temp,'incompatible');json(create(directory));const original=readFileSync(join(directory,'instance.json'));for(const options of [['--port','8898'],['--modules','crm'],['--name','other']]){const result=create(directory,'retail','名稱 含有 空白',options);assert.notEqual(result.status,0);assert.deepEqual(readFileSync(join(directory,'instance.json')),original);}
 for(const [industry,name] of [['retail','different company'],['service','名稱 含有 空白']]){assert.notEqual(create(directory,industry,name).status,0);assert.deepEqual(readFileSync(join(directory,'instance.json')),original);}
 const nonempty=join(temp,'nonempty');mkdirSync(nonempty);writeFileSync(join(nonempty,'keep.txt'),'owner file');assert.notEqual(create(nonempty).status,0);assert.equal(readFileSync(join(nonempty,'keep.txt'),'utf8'),'owner file');assert.equal(existsSync(join(nonempty,'instance.json')),false);
 const malformed=join(temp,'malformed');mkdirSync(malformed);writeFileSync(join(malformed,'instance.json'),'not json');assert.notEqual(create(malformed).status,0);assert.equal(readFileSync(join(malformed,'instance.json'),'utf8'),'not json');assert.equal(existsSync(join(malformed,'wrangler.json')),false);
});
test('symlink directory and symlink ancestor paths are rejected without touching the target',()=>{
 const target=join(temp,'symlink-target');mkdirSync(target);writeFileSync(join(target,'owner.txt'),'not overwritten');const link=join(temp,'symlink-link');symlinkSync(target,link,process.platform==='win32'?'junction':'dir');assert.notEqual(create(link).status,0);assert.notEqual(create(join(link,'nested')).status,0);assert.equal(readFileSync(join(target,'owner.txt'),'utf8'),'not overwritten');assert.equal(existsSync(join(target,'instance.json')),false);assert.equal(existsSync(join(target,'nested')),false);
});
test('help is available and using the package project itself as instance directory is rejected',()=>{assert.equal(run(['--help']).status,0);assert.match(run(['--help']).stdout,/--industry/);assert.notEqual(create(root).status,0);assert.equal(existsSync(join(root,'instance.json')),false);});
