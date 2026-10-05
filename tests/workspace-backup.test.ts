import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {Buffer as NodeBuffer} from 'node:buffer';
import {mkdtempSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {command,createWorld} from '../src/engine';

const require=createRequire(import.meta.url),{buildSync}=require('esbuild');
const origin='https://backup.example.test',chunkBytes=24000,maxBytes=3145728;
const roots:string[]=[];
let script:string,mf:Miniflare;
const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const bytesOf=(world:any)=>NodeBuffer.from(JSON.stringify(world),'utf8');
function storagePath(){const path=mkdtempSync(join(tmpdir(),'of-bak-'));roots.push(path);return path;}
function runtime(storage=storagePath(),publicDemo=true){
 return new Miniflare(convertV4MiniflareOptions({
  name:'workspace-backup-api',modules:true,script,compatibilityDate:'2026-09-28',
  compatibilityFlags:['nodejs_compat'],
  durableObjects:{WORKSPACES:{className:'BackupProbe',useSQLite:true}},
  bindings:{PUBLIC_DEMO:String(publicDemo)},resourcePersistencePath:storage
 }));
}
before(()=>{
 const built=buildSync({entryPoints:['src/worker.ts'],bundle:true,write:false,format:'esm',
  platform:'neutral',target:'es2022',external:['cloudflare:workers','node:*']}).outputFiles[0].text;
 // Probe methods exist only in this test bundle. Advancing an isolated worker clock
 // verifies real expiry paths without a fifteen-minute sleep or production writes.
 script=built+'\nexport class BackupProbe extends BusinessWorkspace {async inspectKeys(){return {state:await this.ctx.storage.get("state"),keys:[...(await this.ctx.storage.list()).keys()]}} async advanceClock(milliseconds){const original=Date.now;Date.now=()=>original()+milliseconds;return Date.now()} async fillReceiptCap(){const state=await this.ctx.storage.get("state");let index=0;while(Object.keys(state.receipts).length<500){const id="cap-fixture-"+String(index++).padStart(3,"0");state.receipts[id]={id,hash:"0".repeat(64),expected_version:0,version:state.version,action:"test.fixture",result:null,created_at:new Date().toISOString(),simulation:true}}await this.ctx.storage.put("state",state);return Object.keys(state.receipts).length}}';
 mf=runtime();
});
after(async()=>{
 await mf?.dispose();
 const tempRoot=resolve(tmpdir());
 for(const path of roots){
  assert.equal(dirname(resolve(path)),tempRoot);
  assert.match(path.slice(tempRoot.length+1),/^of-bak-[A-Za-z0-9]+$/);
  rmSync(path,{recursive:true,force:true});
 }
});
class Visitor{
 cookie='';csrf='';version=0;
 constructor(public runtime=mf){}
 async request(path:string,options:any={}){
  const response=await this.runtime.dispatchFetch(origin+path,{...options,headers:{Cookie:this.cookie,...options.headers}});
  const cookie=response.headers.get('set-cookie');if(cookie)this.cookie=cookie.split(';')[0];
  const body:any=await response.json();
  if(body.csrf)this.csrf=body.csrf;if(typeof body.version==='number')this.version=body.version;
  return {response,body};
 }
 view(){return this.request('/api/workspace/view');}
 status(){return this.request('/api/workspace/import/status');}
 post(path:string,body:any,key:string=randomUUID(),version=this.version,extra:Record<string,string>={}){
  return this.request('/api/workspace/'+path,{method:'POST',headers:{
   Origin:origin,'Content-Type':'application/json','x-csrf-token':this.csrf,
   'Idempotency-Key':key,'If-Match-Version':String(version),...extra
  },body:JSON.stringify(body)});
 }
 async setup(){
  await this.view();
  const result=await this.post('setup',{industry:'retail',company_name:'合成：備份目的工作區'});
  assert.equal(result.response.status,200,JSON.stringify(result.body));
  const business=result.body.workspace.wallets.find((row:any)=>row.kind==='business');
  const funded=await this.post('commands',{action:'wallet.fund',payload:{wallet_id:business.id,amount_minor:67800}});
  assert.equal(funded.response.status,200);
  return funded.body.workspace;
 }
 async probe(){
  const token=this.cookie.slice('freedom_session='.length);
  const name=sha(JSON.stringify(token)),ns=await this.runtime.getDurableObjectNamespace('WORKSPACES');
  return ns.get(ns.idFromName(name)) as any;
 }
}
const fixtures=new Map<string,{world:any;bytes:Uint8Array}>();
function source(large=false){
 const key=large?'large':'normal',cached=fixtures.get(key);if(cached)return cached;
 let world:any=createWorld('retail','合成：可完整還原的來源',undefined);
 const apply=(action:string,payload:any)=>{const result=command(world,action,payload);world=result.workspace;return result.result;};
 apply('office.enable',{});
 const unit=apply('office.unit.create',{name:'合成：備份示範店',kind:'branch'});
 apply('office.staff.create',{code:'SIM-BACKUP',alias:'合成同仁',unit_id:unit});
 const business=world.wallets.find((row:any)=>row.kind==='business');
 apply('wallet.fund',{wallet_id:business.id,amount_minor:100000});
 apply('inventory.receive',{product_id:world.products[0].id,quantity:1});
 const body=large?'合成備份'.repeat(500):'合成備份'.repeat(300),noticeIds:string[]=[];
 for(let index=0;index<(large?70:18);index++)noticeIds.push(apply('office.notice.create',{
  title:'合成：備份公告 '+index,body,unit_id:unit,pinned:index===0
 }));
 if(large){
  for(let index=0;index<70;index++)apply('office.request.create',{
   type:'general',unit_id:unit,title:'合成：備份事項 '+index,description:body
  });
  for(let index=0;index<110;index++)apply(index%2?'office.notice.restore':'office.notice.archive',{id:noticeIds[0]});
 }
 const fixture={world,bytes:bytesOf(world)};fixtures.set(key,fixture);return fixture;
}
async function begin(visitor:Visitor,bytes:Uint8Array,declaredSha=sha(bytes)){
 const result=await visitor.post('import/begin',{bytes:bytes.length,sha256:declaredSha,parts:Math.ceil(bytes.length/chunkBytes)});
 assert.equal(result.response.status,200,JSON.stringify(result.body));
 assert.match(result.body.stage.id,/^[a-f0-9]{64}$/);
 assert.equal(result.body.stage.chunk_bytes,chunkBytes);
 assert.equal(result.body.stage.expected_version,visitor.version);
 return result.body.stage;
}
const partBody=(id:string,index:number,bytes:Uint8Array)=>({
 id,index,chunk:btoa(Array.from(bytes.subarray(index*chunkBytes,(index+1)*chunkBytes),byte=>String.fromCharCode(byte)).join(''))
});
async function transfer(visitor:Visitor,stage:any,bytes:Uint8Array,start=0){
 for(let index=start;index<stage.parts;index++){
  const result=await visitor.post('import/part',partBody(stage.id,index,bytes));
  assert.equal(result.response.status,200,JSON.stringify(result.body));
 }
}
async function unchanged(visitor:Visitor,expected:any){
 const current=await visitor.view();
 assert.equal(current.body.version,expected.version);
 assert.deepEqual(current.body.workspace,expected);
}

test('a large Chinese backup commits once, uses chunked durable state and survives runtime restart intact',async()=>{
 const fixture=source(true);
 assert.ok(fixture.bytes.length>2*1024*1024);
 assert.ok(fixture.bytes.length<maxBytes);
 assert.ok(JSON.stringify(fixture.world).length<=1000000);
 const storage=storagePath();let savedRuntime=runtime(storage,false);
 const visitor=new Visitor(savedRuntime);
 let committed:any,commitKey:string;
 try{
  const original=await visitor.setup(),stage=await begin(visitor,fixture.bytes);
  await unchanged(visitor,original);
  await transfer(visitor,stage,fixture.bytes);
  await unchanged(visitor,original);
  const status=await visitor.status();
  assert.deepEqual(status.body.stage.received,Array.from({length:stage.parts},(_,index)=>index));
  commitKey=randomUUID();
  const result=await visitor.post('import/commit',{id:stage.id},commitKey,original.version);
  assert.equal(result.response.status,200,JSON.stringify(result.body));
  committed=result.body.workspace;
  assert.notEqual(committed.generation_id,original.generation_id);
  assert.notEqual(committed.generation_id,fixture.world.generation_id);
  assert.equal(committed.version,original.version+1);
  const expected={...fixture.world,generation_id:committed.generation_id,version:committed.version};
  assert.equal(sha(bytesOf(committed)),sha(bytesOf(expected)));
  const replay=await visitor.post('import/commit',{id:stage.id},commitKey,original.version);
  assert.equal(replay.response.status,200);
  assert.equal(replay.body.replayed,true);
  assert.equal(sha(bytesOf(replay.body.workspace)),sha(bytesOf(committed)));
  assert.equal((await visitor.status()).body.stage,null);
  const keys=await (await visitor.probe()).inspectKeys();
  assert.equal(keys.state.format,'freedom-state-parts-v1');
  assert.ok(keys.keys.filter((key:string)=>key.startsWith('state-part:')).length>1);
  assert.equal(keys.keys.some((key:string)=>key.startsWith('backup-part:')),false);
 }finally{await savedRuntime.dispose();}
 savedRuntime=runtime(storage,false);visitor.runtime=savedRuntime;
 try{
  const restored=await visitor.view();
  assert.equal(restored.response.status,200);
  assert.equal(sha(bytesOf(restored.body.workspace)),sha(bytesOf(committed)));
  assert.equal(restored.body.version,committed.version);
  const exported=await visitor.request('/api/workspace/export');
  assert.equal(sha(bytesOf(exported.body)),sha(bytesOf(committed)));
 }finally{await savedRuntime.dispose();}
});

test('backup jobs belong to one visitor and retain origin CSRF and exact workspace-version guards',async()=>{
 const visitor=new Visitor(),other=new Visitor(),fixture=source();
 const original=await visitor.setup();await other.setup();
 const stage=await begin(visitor,fixture.bytes);
 assert.equal((await other.status()).body.stage,null);
 const foreign=await other.post('import/part',partBody(stage.id,0,fixture.bytes));
 assert.equal(foreign.response.status,404);
 const headers:Record<string,string>[]=[{Origin:'https://foreign.example.test'},{'x-csrf-token':''},{'x-csrf-token':other.csrf}];
 for(const extra of headers){
  const result=await visitor.post('import/part',partBody(stage.id,0,fixture.bytes),randomUUID(),visitor.version,extra);
  assert.equal(result.response.status,403);
 }
 const stale=await visitor.post('import/part',partBody(stage.id,0,fixture.bytes),randomUUID(),visitor.version-1);
 assert.equal(stale.response.status,412);
 assert.deepEqual((await visitor.status()).body.stage.received,[]);
 await unchanged(visitor,original);
});

test('same-byte part retries are idempotent while changed bytes or keys and incomplete commits cannot replace data',async()=>{
 const visitor=new Visitor(),fixture=source(),original=await visitor.setup(),stage=await begin(visitor,fixture.bytes);
 const key=randomUUID(),body=partBody(stage.id,0,fixture.bytes);
 assert.equal((await visitor.post('import/part',body,key)).response.status,200);
 assert.equal((await visitor.post('import/part',body,key)).response.status,200);
 assert.equal((await visitor.post('import/part',body)).response.status,200);
 assert.deepEqual((await visitor.status()).body.stage.received,[0]);
 const changed=NodeBuffer.from(fixture.bytes);changed[0]^=1;
 const changedBody=partBody(stage.id,0,changed);
 const changedKey=await visitor.post('import/part',changedBody,key);
 assert.equal(changedKey.response.status,409);
 assert.equal(changedKey.body.error.code,'idempotency_conflict');
 const changedIndex=await visitor.post('import/part',changedBody);
 assert.equal(changedIndex.response.status,409);
 assert.equal(changedIndex.body.error.code,'import_part_conflict');
 const incomplete=await visitor.post('import/commit',{id:stage.id});
 assert.equal(incomplete.response.status,409);
 assert.equal(incomplete.body.error.code,'import_incomplete');
 await unchanged(visitor,original);
 await transfer(visitor,stage,fixture.bytes,1);
 assert.equal((await visitor.post('import/commit',{id:stage.id})).response.status,200);
});

test('a newer business edit makes the upload stale and abort removes only staged bytes',async()=>{
 const visitor=new Visitor(),fixture=source(),original=await visitor.setup(),stage=await begin(visitor,fixture.bytes);
 await visitor.post('import/part',partBody(stage.id,0,fixture.bytes));
 const edit=await visitor.post('commands',{action:'customer.create',payload:{name:'合成：傳輸中新增顧客'}});
 assert.equal(edit.response.status,200);
 const current=edit.body.workspace;
 assert.equal(current.version,original.version+1);
 assert.equal((await visitor.post('import/part',partBody(stage.id,1,fixture.bytes))).response.status,412);
 assert.equal((await visitor.post('import/commit',{id:stage.id})).response.status,412);
 const status=await visitor.status();
 assert.equal(status.body.version,current.version);
 assert.equal(status.body.stage.expected_version,original.version);
 await unchanged(visitor,current);
 assert.equal((await visitor.post('import/abort',{id:stage.id})).response.status,200);
 assert.equal((await visitor.status()).body.stage,null);
 await unchanged(visitor,current);
});

test('whole-source hashes invalid UTF-8 invalid JSON and broken references reject at commit without partial writes',async()=>{
 const fixture=source(),broken=structuredClone(fixture.world);
 broken.administration.staff[0].unit_id=randomUUID();
 const realFinance=structuredClone(fixture.world);realFinance.currency='TWD';
 const invalids=[
  {bytes:fixture.bytes,hash:'0'.repeat(64)},
  {bytes:NodeBuffer.from([255,254,0])},
  {bytes:NodeBuffer.from('{"incomplete":','utf8')},
  {bytes:bytesOf(broken)},
  {bytes:bytesOf(realFinance)}
 ];
 for(const invalid of invalids){
  const visitor=new Visitor(),original=await visitor.setup(),stage=await begin(visitor,invalid.bytes,invalid.hash??sha(invalid.bytes));
  await transfer(visitor,stage,invalid.bytes);
  const result=await visitor.post('import/commit',{id:stage.id});
  assert.ok([404,422].includes(result.response.status),JSON.stringify(result.body));
  await unchanged(visitor,original);
 }
});

test('manifest and chunk limits reject before changing data and cancel cleans up a partially uploaded backup',async()=>{
 const visitor=new Visitor(),fixture=source(),original=await visitor.setup();
 for(const manifest of [
  {bytes:0,sha256:sha(fixture.bytes),parts:0},
  {bytes:maxBytes+1,sha256:sha(fixture.bytes),parts:Math.ceil((maxBytes+1)/chunkBytes)},
  {bytes:fixture.bytes.length,sha256:sha(fixture.bytes),parts:1},
  {bytes:fixture.bytes.length,sha256:'not-a-hash',parts:Math.ceil(fixture.bytes.length/chunkBytes)}
 ])assert.equal((await visitor.post('import/begin',manifest)).response.status,422);
 assert.equal((await visitor.status()).body.stage,null);
 const stage=await begin(visitor,fixture.bytes);
 for(const body of [
  {id:stage.id,index:-1,chunk:'AA=='},
  {id:stage.id,index:stage.parts,chunk:'AA=='},
  {id:stage.id,index:0,chunk:'not base64'},
  {id:stage.id,index:0,chunk:'AA=='}
 ])assert.equal((await visitor.post('import/part',body)).response.status,422);
 assert.equal((await visitor.post('import/part',partBody(stage.id,0,fixture.bytes))).response.status,200);
 assert.equal((await visitor.post('import/abort',{id:stage.id})).response.status,200);
 assert.equal((await visitor.status()).body.stage,null);
 const keys=await (await visitor.probe()).inspectKeys();
 assert.equal(keys.keys.some((key:string)=>key.startsWith('backup-part:')),false);
 assert.equal((await visitor.post('import/commit',{id:stage.id})).response.status,404);
 await unchanged(visitor,original);
 assert.notEqual((await begin(visitor,fixture.bytes)).id,stage.id);
});

test('status resumes the same file in the same cookie and an expired stage cannot be committed',async()=>{
 const savedRuntime=runtime(undefined,false),visitor=new Visitor(savedRuntime),fixture=source();
 try{
  const original=await visitor.setup(),stage=await begin(visitor,fixture.bytes);
  await visitor.post('import/part',partBody(stage.id,0,fixture.bytes));
  const resumed=new Visitor(savedRuntime);resumed.cookie=visitor.cookie;await resumed.view();
  const status=await resumed.status();
  assert.equal(status.body.stage.id,stage.id);
  assert.equal(status.body.stage.sha256,sha(fixture.bytes));
  assert.equal(status.body.stage.expected_version,original.version);
  assert.deepEqual(status.body.stage.received,[0]);
  await (await resumed.probe()).advanceClock(16*60*1000);
  assert.equal((await resumed.status()).body.stage,null);
  assert.equal((await resumed.post('import/commit',{id:stage.id})).response.status,404);
  await unchanged(resumed,original);
 }finally{await savedRuntime.dispose();}
});

test('small legacy imports stay compatible and a cleared workspace never resurrects from a committed backup receipt',async()=>{
 const visitor=new Visitor(),original=await visitor.setup();
 const legacy=await visitor.post('import',{workspace:original});
 assert.equal(legacy.response.status,200);
 const fixture=source(),before=(await visitor.view()).body.workspace;
 assert.ok(fixture.bytes.length>32768);
 assert.equal((await visitor.post('import',{workspace:fixture.world})).response.status,413);
 await unchanged(visitor,before);
 const stage=await begin(visitor,fixture.bytes);await transfer(visitor,stage,fixture.bytes);
 const key=randomUUID(),version=visitor.version;
 const committed=await visitor.post('import/commit',{id:stage.id},key,version);
 assert.equal(committed.response.status,200);
 assert.equal((await visitor.post('clear',{})).response.status,200);
 const clearedVersion=visitor.version;
 const replay=await visitor.post('import/commit',{id:stage.id},key,version);
 assert.equal(replay.response.status,200);
 assert.equal(replay.body.replayed,true);
 assert.equal(replay.body.workspace,null);
 assert.equal((await visitor.view()).body.version,clearedVersion);
});

test('cancelling by begin key wins both before and after a delayed begin without leaving an active upload',async()=>{
 const fixture=source();
 for(const order of ['cancel-first','begin-first']){
  const visitor=new Visitor(),original=await visitor.setup(),beginKey=randomUUID();
  const manifest={bytes:fixture.bytes.length,sha256:sha(fixture.bytes),parts:Math.ceil(fixture.bytes.length/chunkBytes)};
  if(order==='begin-first'){
   const accepted=await visitor.post('import/begin',manifest,beginKey);
   assert.equal(accepted.response.status,200);
   assert.equal((await visitor.post('import/part',partBody(accepted.body.stage.id,0,fixture.bytes))).response.status,200);
  }
  const cancelled=await visitor.post('import/abort',{begin_key:beginKey});
  assert.equal(cancelled.response.status,200,JSON.stringify(cancelled.body));
  const delayed=await visitor.post('import/begin',manifest,beginKey);
  assert.equal(delayed.response.status,409);
  assert.equal(delayed.body.error.code,'import_cancelled');
  assert.equal((await visitor.status()).body.stage,null);
  assert.equal((await (await visitor.probe()).inspectKeys()).keys.some((key:string)=>key.startsWith('backup-part:')),false);
  await unchanged(visitor,original);
  const next=await visitor.post('import/begin',manifest);
  assert.equal(next.response.status,200);
 }
});

test('a full receipt cache still allows clear and import while an evicted old setup key cannot resurrect data',async()=>{
 const visitor=new Visitor();await visitor.view();
 const oldKey=randomUUID(),setupBody={industry:'retail',company_name:'合成：收據容量驗收'};
 const created=await visitor.post('setup',setupBody,oldKey,0);
 assert.equal(created.response.status,200);
 assert.equal(await (await visitor.probe()).fillReceiptCap(),500);
 const before=created.body.workspace;
 const rejected=await visitor.post('commands',{action:'customer.create',payload:{name:'不可超額新增'}});
 assert.equal(rejected.response.status,429);
 assert.equal(rejected.body.error.code,'receipt_limit');
 await unchanged(visitor,before);
 assert.equal((await visitor.post('clear',{})).response.status,200);
 const clearedVersion=visitor.version;
 const replay=await visitor.post('setup',setupBody,oldKey,0);
 assert.equal(replay.response.status,412);
 assert.equal((await visitor.view()).body.workspace,null);
 assert.equal(visitor.version,clearedVersion);
 const restored=await visitor.post('import',{workspace:before});
 assert.equal(restored.response.status,200);
 assert.notEqual(restored.body.workspace.generation_id,before.generation_id);
 assert.equal(restored.body.workspace.version,clearedVersion+1);
 assert.equal(restored.body.workspace.customers.some((entry:any)=>entry.name==='不可超額新增'),false);
});
