import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const require=createRequire(import.meta.url),{buildSync}=require('esbuild');
const built=buildSync({entryPoints:['src/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers','node:*']});
const script=built.outputFiles[0].text+"\nexport class WorkspaceProbe extends BusinessWorkspace {async inspectState(){return {alarm:await this.ctx.storage.getAlarm(),state:await this.ctx.storage.get('state')}}}";
const origin='http://local.example.test';
const defaults={PUBLIC_DEMO:'false',AUTO_SETUP:'true',DEFAULT_INDUSTRY:'general',DEFAULT_COMPANY:'一鍵店名 "quoted" $() & 中文',DEFAULT_MODULES:'crm,wallets,inventory,sales,services,projects,manufacturing'};
mkdirSync('.audit-tmp/release-validation',{recursive:true});
function runtime(bindings:Record<string,string>,storage=resolve('.audit-tmp/release-validation/quickstart-api-'+randomUUID())){return new Miniflare(convertV4MiniflareOptions({name:'quickstart-runtime',modules:true,script,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],durableObjects:{WORKSPACES:{className:'WorkspaceProbe',useSQLite:true}},bindings,resourcePersistencePath:storage}));}
class Visitor{
 cookie='';csrf='';version=0;
 constructor(public mf:Miniflare){}
 async request(path:string,options:any={}){const response=await this.mf.dispatchFetch(origin+path,{...options,headers:{Cookie:this.cookie,...options.headers}});const cookie=response.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];const body:any=await response.json();if(body.csrf)this.csrf=body.csrf;if(typeof body.version==='number')this.version=body.version;return {response,body};}
 view(){return this.request('/api/workspace/view');}
 post(path:string,body:any){return this.request('/api/workspace/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-csrf-token':this.csrf,'Idempotency-Key':randomUUID(),'If-Match-Version':String(this.version)},body:JSON.stringify(body)});}
 async inspect(){const token=this.cookie.slice('freedom_session='.length),name=createHash('sha256').update(JSON.stringify(token)).digest('hex'),ns=await this.mf.getDurableObjectNamespace('WORKSPACES');return (ns.get(ns.idFromName(name)) as any).inspectState();}
}
test('fresh selfhost first view seeds selected profile once with version one, zero balances and stock, no transactions or expiry',async()=>{
 const mf=runtime(defaults);try{
  const visitor=new Visitor(mf),first=await visitor.view();assert.equal(first.response.status,200);const world=first.body.workspace;assert.equal(first.body.version,1);assert.equal(world.version,1);assert.equal(world.company_name,defaults.DEFAULT_COMPANY);assert.equal(world.industry,'general');assert.deepEqual(world.modules,defaults.DEFAULT_MODULES.split(','));assert.equal(world.simulation,true);assert.equal(world.real_finance,false);assert.equal(world.currency,'SIM');assert.equal(first.body.retention_hours,null);assert.equal(first.body.expires_at,null);assert.match(first.response.headers.get('set-cookie')!,/Max-Age=31536000/);
  assert.ok(world.products.every((p:any)=>p.on_hand===0&&p.reserved===0&&p.stock_value_minor===0&&p.lots.length===0));assert.ok(world.wallets.every((w:any)=>w.balance_minor===0));assert.equal(world.ledger.length,0);assert.equal(world.orders.length,0);assert.equal(world.purchases.length,0);
  assert.deepEqual((await visitor.view()).body.workspace,world);assert.equal((await visitor.inspect()).alarm,null);assert.deepEqual((await visitor.inspect()).state.receipts,{});assert.equal((await visitor.post('setup',{industry:'retail',company_name:'no overwrite'})).response.status,409);
  const templateData=(await visitor.request('/api/templates')).body;assert.equal(templateData.defaults.auto_setup,true);assert.equal(templateData.defaults.public_demo,false);
 }finally{await mf.dispose();}
});
test('public mode ignores AUTO_SETUP even when flag is true, and ordinary selfhost remains manually initialized',async()=>{
 for(const bindings of [{...defaults,PUBLIC_DEMO:'true'},{...defaults,PUBLIC_DEMO:'unexpected'},{...defaults,AUTO_SETUP:'false'},Object.fromEntries(Object.entries(defaults).filter(([key])=>key!=='AUTO_SETUP'))]){
  const mf=runtime(bindings);try{const visitor=new Visitor(mf),view=await visitor.view();assert.equal(view.body.workspace,null);assert.equal(view.body.version,0);assert.equal((await visitor.request('/api/templates')).body.defaults.auto_setup,false);assert.equal((await visitor.post('setup',{industry:'retail',company_name:'手動建立'})).response.status,200);}finally{await mf.dispose();}
 }
});
test('cleared and previously stored empty workspaces stay empty after auto setup is enabled',async()=>{
 const storage=resolve('.audit-tmp/release-validation/qs-existing-'+randomUUID());let mf=runtime({...defaults,AUTO_SETUP:'false'},storage);const visitor=new Visitor(mf);try{assert.equal((await visitor.view()).body.workspace,null);}finally{await mf.dispose();}
 mf=runtime(defaults,storage);visitor.mf=mf;try{assert.equal((await visitor.view()).body.workspace,null);assert.equal(visitor.version,0);assert.equal((await visitor.post('setup',{industry:'retail',company_name:'人工建立'})).response.status,200);assert.equal((await visitor.post('clear',{})).response.status,200);assert.equal((await visitor.view()).body.workspace,null);assert.equal(visitor.version,2);}finally{await mf.dispose();}
 mf=runtime(defaults,storage);visitor.mf=mf;try{assert.equal((await visitor.view()).body.workspace,null);assert.equal(visitor.version,2);}finally{await mf.dispose();}
});
test('auto initialized Durable Object survives runtime restart without changing generation or existing records',async()=>{
 const storage=resolve('.audit-tmp/release-validation/quickstart-reboot-'+randomUUID());let mf=runtime(defaults,storage);const visitor=new Visitor(mf);let expected:any;
 try{await visitor.view();assert.equal((await visitor.post('commands',{action:'customer.create',payload:{name:'重啟仍在的顧客'}})).response.status,200);expected=(await visitor.view()).body.workspace;}finally{await mf.dispose();}
 mf=runtime(defaults,storage);visitor.mf=mf;try{const restarted=await visitor.view();assert.deepEqual(restarted.body.workspace,expected);assert.equal(restarted.body.version,2);assert.equal((await visitor.inspect()).alarm,null);}finally{await mf.dispose();}
});
