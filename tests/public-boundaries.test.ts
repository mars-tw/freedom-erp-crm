import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const require=createRequire(import.meta.url);
const {buildSync}=require('esbuild');
const origin='https://public.example.test';
let mf:Miniflare;
before(async()=>{
 mkdirSync('.audit-tmp/release-validation',{recursive:true});
 const built=buildSync({entryPoints:['src/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers','node:*']});
 const probe="\nexport class WorkspaceProbe extends BusinessWorkspace {async inspectState(){return {alarm:await this.ctx.storage.getAlarm(),state:await this.ctx.storage.get('state')}} async expireState(){await this.alarm();return this.inspectState()}}";
 mf=new Miniflare(convertV4MiniflareOptions({name:'public-boundaries',modules:true,script:built.outputFiles[0].text+probe,compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],durableObjects:{WORKSPACES:{className:'WorkspaceProbe',useSQLite:true}},bindings:{PUBLIC_DEMO:'true'},resourcePersistencePath:resolve('.audit-tmp/release-validation/public-test-state-'+randomUUID())}));
});
after(async()=>{await mf?.dispose();});
class Visitor {
 cookie='';csrf='';version=0;
 async request(path:string,options:any={}){const headers={Cookie:this.cookie,...options.headers};const r=await mf.dispatchFetch(origin+path,{...options,headers});const cookie=r.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];let body:any;try{body=await r.json();}catch{body=null;}if(body?.csrf)this.csrf=body.csrf;if(typeof body?.version==='number')this.version=body.version;else if(body?.receipt)this.version=body.receipt.version;else if(body?.workspace)this.version=body.workspace.version;return {response:r,body};}
 async view(){return this.request('/api/workspace/view');}
 async post(path:string,body:any,key=randomUUID(),version=this.version,extra:Record<string,string>={}){return this.request('/api/workspace/'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-csrf-token':this.csrf,'Idempotency-Key':key,'If-Match-Version':String(version),...extra},body:JSON.stringify(body)});}
 async setup(modules?:string[]){await this.view();return this.post('setup',{industry:'general',company_name:'獨立測試工作區',...(modules?{modules}:{})});}
 async command(action:string,payload:any,key=randomUUID(),version=this.version){return this.post('commands',{action,payload},key,version);}
}
test('public visitors receive 256-bit HttpOnly Secure cookies and isolated persisted workspaces',async()=>{
 const a=new Visitor(),b=new Visitor();const first=await a.view();assert.equal(first.response.status,200);const cookie=first.response.headers.get('set-cookie')!;assert.match(cookie,/freedom_session=[a-f0-9]{64};/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/SameSite=Strict/);assert.match(cookie,/Secure/);assert.match(cookie,/Max-Age=259200/);assert.equal(first.response.headers.get('cache-control'),'no-store');await b.view();assert.notEqual(a.cookie,b.cookie);assert.notEqual(a.csrf,b.csrf);
 assert.equal((await a.setup()).response.status,200);assert.equal((await b.view()).body.workspace,null);const created=await a.command('customer.create',{name:'visitor A only'});assert.equal(created.response.status,200);assert.equal((await b.setup()).response.status,200);assert.equal((await b.view()).body.workspace.customers.some((v:any)=>v.name==='visitor A only'),false);const again=new Visitor();again.cookie=a.cookie;assert.equal((await again.view()).body.workspace.customers.some((v:any)=>v.name==='visitor A only'),true);
});
test('actual API rejects missing and cross-visitor CSRF, foreign Origin, stale versions and changed-key replay',async()=>{
 const a=new Visitor(),b=new Visitor();await a.setup();await b.setup();const before=(await a.view()).body.workspace;
 for(const headers of ([{'x-csrf-token':''},{'x-csrf-token':b.csrf},{Origin:'https://attacker.example'}] as Record<string,string>[]))assert.equal((await a.post('commands',{action:'customer.create',payload:{name:'blocked'}},randomUUID(),a.version,headers)).response.status,403);
 assert.deepEqual((await a.view()).body.workspace,before);const key=randomUUID(),version=a.version,body={action:'customer.create',payload:{name:'exactly once'}};const created=await a.post('commands',body,key,version);assert.equal(created.response.status,200);const replay=await a.post('commands',body,key,version);assert.equal(replay.response.status,200);assert.equal(replay.body.replayed,true);assert.equal(replay.body.result,created.body.result);assert.equal((await a.post('commands',{...body,payload:{name:'different'}},key,version)).response.status,409);assert.equal((await a.command('customer.create',{name:'stale'},randomUUID(),version)).response.status,412);
 assert.equal((await a.request('/api/workspace/receipts/'+key)).response.status,200);assert.equal((await b.request('/api/workspace/receipts/'+key)).response.status,404);const foreignId=created.body.result;assert.equal((await b.command('customer.update',{id:foreignId,name:'cross visitor'})).response.status,404);
});
test('disabled modules and real finance fields cannot be activated by command payloads',async()=>{
 const a=new Visitor();await a.setup(['crm']);assert.equal((await a.command('wallet.fund',{wallet_id:randomUUID(),amount_minor:100})).response.status,403);assert.equal((await a.command('customer.create',{name:'fake',real_finance:true})).response.status,422);const v=(await a.view()).body.workspace;assert.equal(v.currency,'SIM');assert.equal(v.simulation,true);assert.equal(v.real_finance,false);assert.equal((await a.request('/api/health')).body.real_finance,false);
});
test('clear rotates CSRF, preserves monotonic versions, and old setup receipt does not resurrect cleared data',async()=>{
 const a=new Visitor();await a.view();const setupKey=randomUUID(),setupBody={industry:'retail',company_name:'clear test'};const created=await a.post('setup',setupBody,setupKey,0);assert.equal(created.response.status,200);const oldCsrf=a.csrf,oldVersion=a.version;const cleared=await a.post('clear',{});assert.equal(cleared.response.status,200);assert.equal(cleared.body.workspace,null);assert.notEqual(a.csrf,oldCsrf);assert.ok(a.version>oldVersion);assert.equal((await a.post('setup',setupBody,randomUUID(),a.version,{'x-csrf-token':oldCsrf})).response.status,403);const replay=await a.post('setup',setupBody,setupKey,0);assert.equal(replay.response.status,200);assert.equal(replay.body.workspace,null);assert.equal((await a.post('setup',{industry:'service',company_name:'new generation'},randomUUID(),cleared.body.receipt.version)).response.status,200);assert.notEqual((await a.view()).body.workspace.generation_id,created.body.workspace.generation_id);
});
test('real API export/import rejects financial tampering and structural broken references without changing current state',async()=>{
 const a=new Visitor();await a.setup();const original=(await a.request('/api/workspace/export')).body;
 const corruptions=[(w:any)=>{w.real_finance=true;},(w:any)=>{w.currency='TWD';},(w:any)=>{w.simulation=false;},(w:any)=>{w.products[0].lots=[{quantity:1,cost_minor:1}];},(w:any)=>{w.contacts.push({id:randomUUID(),customer_id:randomUUID()});},(w:any)=>{w.wallets.find((v:any)=>v.kind==='business').balance_minor=10;w.wallets.find((v:any)=>v.kind==='faucet').balance_minor=-10;}];
 for(const mutate of corruptions){const w=structuredClone(original);mutate(w);const r=await a.post('import',{workspace:w});assert.ok([404,422].includes(r.response.status),JSON.stringify(r.body));assert.deepEqual((await a.view()).body.workspace,original);}
 const imported=await a.post('import',{workspace:original});assert.equal(imported.response.status,200);assert.notEqual(imported.body.workspace.generation_id,original.generation_id);assert.ok(imported.body.workspace.version>original.version);
});
test('public Durable Object state has an inactivity deletion alarm no later than 72 hours',async()=>{
 const a=new Visitor();await a.setup();const ns=await mf.getDurableObjectNamespace('WORKSPACES');const token=a.cookie.slice('freedom_session='.length),name=createHash('sha256').update(JSON.stringify(token)).digest('hex');const id=ns.idFromName(name);const stub:any=ns.get(id);const before=Date.now();const info=await stub.inspectState();assert.ok(info.alarm);assert.ok(info.alarm>before+71.9*3600000&&info.alarm<=Date.now()+72*3600000);assert.ok(info.state);const expired=await stub.expireState();assert.equal(expired.state,undefined);assert.equal((await a.view()).body.workspace,null);
});
test('imported orders cannot forge shipped quantities, reservations, FIFO amounts or bank confirmation',async()=>{
 const a=new Visitor();await a.setup();let w=(await a.view()).body.workspace;const business=w.wallets.find((v:any)=>v.kind==='business'),buyer=w.wallets.find((v:any)=>v.kind==='buyer'),product=w.products[0];
 for(const wallet of [business,buyer])assert.equal((await a.command('wallet.fund',{wallet_id:wallet.id,amount_minor:100000})).response.status,200);
 assert.equal((await a.command('inventory.receive',{product_id:product.id,quantity:2})).response.status,200);const order=await a.command('order.create',{buyer_wallet_id:buyer.id,lines:[{product_id:product.id,quantity:1}]});assert.equal(order.response.status,200);
 const original=(await a.request('/api/workspace/export')).body;
 for(const mutate of [(v:any)=>{v.orders[0].lines[0].shipped_quantity=2;},(v:any)=>{v.products[0].reserved=0;},(v:any)=>{v.orders[0].paid_minor=1;},(v:any)=>{v.platform_bank_verified=true;},(v:any)=>{v.orders[0].platform_bank_verified=true;}]){
  w=structuredClone(original);mutate(w);const result=await a.post('import',{workspace:w});assert.equal(result.response.status,422,JSON.stringify(result.body));assert.deepEqual((await a.view()).body.workspace,original);
 }
});
