import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const require=createRequire(import.meta.url);
const {buildSync}=require('esbuild');
const origin='https://office.example.test';
const collections=['units','staff','shifts','attendance','requests','equipment','reservations','notices'] as const;
const storageRoots:string[]=[];
let script:string;
let mf:Miniflare;

function storagePath(){
 const path=mkdtempSync(join(tmpdir(),'of-api-'));
 storageRoots.push(path);
 return path;
}
function runtime(bindings:Record<string,string>={PUBLIC_DEMO:'true'},storage=storagePath()){
 return new Miniflare(convertV4MiniflareOptions({
  name:'administration-api',modules:true,script,compatibilityDate:'2026-09-28',
  compatibilityFlags:['nodejs_compat'],
  durableObjects:{WORKSPACES:{className:'BusinessWorkspace',useSQLite:true}},
  bindings,resourcePersistencePath:storage
 }));
}
before(()=>{
 script=buildSync({
  entryPoints:['src/worker.ts'],bundle:true,write:false,format:'esm',platform:'neutral',
  target:'es2022',external:['cloudflare:workers','node:*']
 }).outputFiles[0].text;
 mf=runtime();
});
after(async()=>{
 await mf?.dispose();
 const tempRoot=resolve(tmpdir());
 for(const path of storageRoots){
  assert.equal(dirname(resolve(path)),tempRoot);
  assert.match(path.slice(tempRoot.length+1),/^of-api-[A-Za-z0-9]+$/);
  rmSync(path,{recursive:true,force:true});
 }
});

class Visitor{
 cookie='';csrf='';version=0;
 constructor(public runtime=mf){}
 async request(path:string,options:any={}){
  const response=await this.runtime.dispatchFetch(origin+path,{
   ...options,headers:{Cookie:this.cookie,...options.headers}
  });
  const cookie=response.headers.get('set-cookie');
  if(cookie)this.cookie=cookie.split(';')[0];
  const body:any=await response.json();
  if(body.csrf)this.csrf=body.csrf;
  if(typeof body.version==='number')this.version=body.version;
  else if(body.workspace)this.version=body.workspace.version;
  return {response,body};
 }
 view(){return this.request('/api/workspace/view');}
 post(path:string,body:any,key=randomUUID(),version=this.version,extra:Record<string,string>={}){
  return this.request('/api/workspace/'+path,{
   method:'POST',
   headers:{
    Origin:origin,'Content-Type':'application/json','x-csrf-token':this.csrf,
    'Idempotency-Key':key,'If-Match-Version':String(version),...extra
   },
   body:JSON.stringify(body)
  });
 }
 async setup(industry='retail',modules?:string[]){
  await this.view();
  const result=await this.post('setup',{
   industry,company_name:'合成：行政 API 驗收',...(modules?{modules}:{})
  });
  assert.equal(result.response.status,200,JSON.stringify(result.body));
  return result.body.workspace;
 }
 async command(action:string,payload:any={},key=randomUUID(),version=this.version){
  return this.post('commands',{action,payload},key,version);
 }
 async apply(action:string,payload:any={}){
  const result=await this.command(action,payload);
  assert.equal(result.response.status,200,JSON.stringify(result.body));
  return result.body;
 }
 async world(){return (await this.view()).body.workspace;}
}

function financialState(world:any){
 return structuredClone({
  products:world.products,wallets:world.wallets,orders:world.orders,services:world.services,
  ledger:world.ledger,purchases:world.purchases,boms:world.boms,workOrders:world.workOrders
 });
}
function financialReport(report:any){
 const {administration,...legacy}=report;
 return legacy;
}
async function seedOffice(visitor:Visitor,suffix='A'){
 const unit=(await visitor.apply('office.unit.create',{name:'合成：行政單位 '+suffix,kind:'branch'})).result;
 const staff=(await visitor.apply('office.staff.create',{code:'SIM-'+suffix,alias:'合成同仁 '+suffix,unit_id:unit})).result;
 const shift=(await visitor.apply('office.shift.create',{
  unit_id:unit,staff_id:staff,start_at:'2026-10-05T14:00:00.000Z',
  end_at:'2026-10-05T22:00:00.000Z',break_minutes:30,note:'合成：跨夜排班'
 })).result;
 const attendance=(await visitor.apply('office.attendance.create',{
  unit_id:unit,staff_id:staff,start_at:'2026-10-05T14:00:00.000Z',
  end_at:'2026-10-05T22:00:00.000Z',break_minutes:30,note:'合成：另外記錄實際出勤'
 })).result;
 const request=(await visitor.apply('office.request.create',{
  type:'expense',unit_id:unit,staff_id:staff,title:'合成：費用整理 '+suffix,amount_minor:120500
 })).result;
 const equipment=(await visitor.apply('office.equipment.create',{code:'SIM-EQ-'+suffix,name:'合成：投影機 '+suffix,unit_id:unit})).result;
 const reservation=(await visitor.apply('office.reservation.create',{
  equipment_id:equipment,staff_id:staff,start_at:'2026-10-06T01:00:00.000Z',
  end_at:'2026-10-06T03:00:00.000Z',purpose:'合成：場地測試'
 })).result;
 const notice=(await visitor.apply('office.notice.create',{
  title:'合成：公告 '+suffix,body:'合成：週會準備',unit_id:unit,pinned:true,due_at:'2026-10-07T01:00:00.000Z'
 })).result;
 return {unit,staff,shift,attendance,request,equipment,reservation,notice};
}

test('enabling administration preserves an existing retail generation and every legacy record',async()=>{
 const visitor=new Visitor();
 const initial=await visitor.setup();
 assert.equal(initial.modules.includes('administration'),false);
 const business=initial.wallets.find((row:any)=>row.kind==='business');
 await visitor.apply('wallet.fund',{wallet_id:business.id,amount_minor:1000000});
 await visitor.apply('inventory.receive',{product_id:initial.products[0].id,quantity:3});
 await visitor.apply('customer.create',{name:'合成：行政啟用前顧客'});
 const before=await visitor.world(),enabled=await visitor.apply('office.enable');
 const after=enabled.workspace;
 assert.equal(after.generation_id,before.generation_id);
 assert.equal(after.version,before.version+1);
 assert.deepEqual(after.modules,[...before.modules,'administration']);
 assert.equal(after.administration.format,'freedom-administration-v1');
 for(const collection of collections)assert.deepEqual(after.administration[collection],[]);
 for(const [key,value] of Object.entries(before)){
  if(!['version','modules','history','administration'].includes(key))assert.deepEqual(after[key],value,key);
 }
 assert.deepEqual(after.history.slice(0,-1),before.history);
 assert.equal(after.history.at(-1).action,'office.enable');
 assert.deepEqual(financialState(after),financialState(before));
});

test('office mutations retain module, origin, CSRF, version and exact-key replay boundaries',async()=>{
 const visitor=new Visitor(),other=new Visitor();
 await visitor.setup();await other.setup();
 const before=await visitor.world();
 const disabled=await visitor.command('office.unit.create',{name:'合成：未啟用',kind:'department'});
 assert.equal(disabled.response.status,403);
 assert.equal(disabled.body.error.code,'module_disabled');
 const blockedHeaders:Record<string,string>[]=[
  {Origin:'https://foreign.example.test'},
  {'x-csrf-token':''},
  {'x-csrf-token':other.csrf}
 ];
 for(const extra of blockedHeaders){
  const rejected=await visitor.post('commands',{action:'office.enable',payload:{}},randomUUID(),visitor.version,extra);
  assert.equal(rejected.response.status,403);
 }
 assert.deepEqual(await visitor.world(),before);
 const key=randomUUID(),version=visitor.version,body={action:'office.enable',payload:{}};
 const enabled=await visitor.post('commands',body,key,version);
 assert.equal(enabled.response.status,200,JSON.stringify(enabled.body));
 const stable=await visitor.world();
 const replay=await visitor.post('commands',body,key,version);
 assert.equal(replay.response.status,200);
 assert.equal(replay.body.replayed,true);
 assert.equal(replay.body.result,enabled.body.result);
 assert.deepEqual(replay.body.workspace,stable);
 const changed=await visitor.post('commands',{action:'office.unit.create',payload:{name:'合成：換內容',kind:'department'}},key,version);
 assert.equal(changed.response.status,409);
 assert.equal(changed.body.error.code,'idempotency_conflict');
 const stale=await visitor.command('office.unit.create',{name:'合成：過時',kind:'department'},randomUUID(),version);
 assert.equal(stale.response.status,412);
 assert.equal(stale.body.error.code,'version_stale');
 assert.deepEqual(await visitor.world(),stable);
 assert.equal((await other.world()).administration,undefined);
});

test('all eight administration collections export valid SIM data and reports without writing money',async()=>{
 const visitor=new Visitor();
 await visitor.setup();await visitor.apply('office.enable');
 const before=await visitor.view(),ids=await seedOffice(visitor);
 const statuses:string[]=[];
 const request=async(action:string,payload:any)=>{
  const result=await visitor.apply(action,{id:ids.request,...payload});
  const record=result.workspace.administration.requests.find((row:any)=>row.id===ids.request);
  statuses.push(record.status);
  return record;
 };
 const returnReason='合成：補上用途說明';
 statuses.push((await visitor.world()).administration.requests[0].status);
 await request('office.request.submit',{});
 await request('office.request.return',{processing_note:returnReason});
 await request('office.request.update',{description:'合成：已補用途'});
 const resubmitted=await request('office.request.submit',{});
 assert.equal(resubmitted.processing_note,returnReason);
 assert.ok(resubmitted.transitions.some((entry:any)=>entry.status==='returned'&&entry.note===returnReason));
 const prepared=await request('office.request.prepare',{});
 assert.deepEqual(statuses,['draft','submitted','returned','draft','submitted','prepared_unreviewed']);
 assert.equal(prepared.processing_note,returnReason);
 assert.deepEqual(prepared.transitions.map((entry:any)=>entry.status),statuses);
 assert.equal(prepared.transitions.filter((entry:any)=>entry.status==='returned'&&entry.note===returnReason).length,1);
 const withdrawal=(await visitor.apply('office.request.create',{type:'general',unit_id:ids.unit,title:'合成：撤回草稿'})).result;
 await visitor.apply('office.request.withdraw',{id:withdrawal});
 const weekLeave=(await visitor.apply('office.request.create',{
  type:'leave',unit_id:ids.unit,staff_id:ids.staff,title:'合成：七日請假時段',
  start_at:'2026-10-12T01:00:00.000Z',end_at:'2026-10-19T01:00:00.000Z'
 })).result;
 await visitor.apply('office.request.withdraw',{id:weekLeave});
 await visitor.apply('office.reservation.return',{id:ids.reservation});
 await visitor.apply('office.reservation.create',{
  equipment_id:ids.equipment,staff_id:ids.staff,start_at:'2026-10-06T01:00:00.000Z',
  end_at:'2026-10-06T03:00:00.000Z',purpose:'合成：歸還後重新預約'
 });
 const weekBooking=(await visitor.apply('office.reservation.create',{
  equipment_id:ids.equipment,staff_id:ids.staff,start_at:'2026-11-02T01:00:00.000Z',
  end_at:'2026-11-09T01:00:00.000Z',purpose:'合成：七日設備借用'
 })).result;
 await visitor.apply('office.reservation.return',{id:weekBooking});
 const after=await visitor.view();
 for(const collection of collections)assert.ok(after.body.workspace.administration[collection].length>0,collection);
 assert.deepEqual(financialState(after.body.workspace),financialState(before.body.workspace));
 assert.deepEqual(financialReport(after.body.report),financialReport(before.body.report));
 assert.deepEqual(after.body.report.administration,{
  active_units:1,active_staff:1,scheduled_shifts:1,actual_work_minutes:450,open_requests:0,
  prepared_unreviewed_requests:1,available_equipment:1,active_reservations:1,pinned_notices:1
 });
 const frozen=structuredClone(after.body.workspace);
 const invalid=await visitor.command('office.request.update',{id:ids.request,title:'不可改寫待覆核'});
 assert.equal(invalid.response.status,409);
 assert.equal(invalid.body.error.code,'office_transition_invalid');
 assert.deepEqual(await visitor.world(),frozen);
 const exported=await visitor.request('/api/workspace/export');
 assert.equal(exported.response.status,200);
 assert.deepEqual(exported.body,frozen);
 assert.equal(exported.body.simulation,true);
 assert.equal(exported.body.real_finance,false);
 assert.equal(exported.body.currency,'SIM');
 const imported=await visitor.post('import',{workspace:exported.body});
 assert.equal(imported.response.status,200,JSON.stringify(imported.body));
 assert.notEqual(imported.body.workspace.generation_id,frozen.generation_id);
 assert.deepEqual(imported.body.workspace.administration,frozen.administration);
 assert.deepEqual(financialState(imported.body.workspace),financialState(frozen));
});

test('copying a week rejects the entire batch on a later conflict and keeps cancelled sources out',async()=>{
 const visitor=new Visitor();
 await visitor.setup();await visitor.apply('office.enable');
 const unit=(await visitor.apply('office.unit.create',{name:'合成：週班表',kind:'branch'})).result;
 const staff=(await visitor.apply('office.staff.create',{code:'SIM-WEEK',alias:'合成週班同仁',unit_id:unit})).result;
 const shift=(start_at:string,end_at:string)=>visitor.apply('office.shift.create',{unit_id:unit,staff_id:staff,start_at,end_at,break_minutes:30,note:'合成：來源班次'});
 const first=(await shift('2026-10-05T00:00:00.000Z','2026-10-05T04:00:00.000Z')).result;
 const second=(await shift('2026-10-06T00:00:00.000Z','2026-10-06T04:00:00.000Z')).result;
 const cancelled=(await shift('2026-10-07T00:00:00.000Z','2026-10-07T04:00:00.000Z')).result;
 await visitor.apply('office.shift.complete',{id:second});
 await visitor.apply('office.shift.cancel',{id:cancelled});
 const conflict=(await shift('2026-10-13T00:00:00.000Z','2026-10-13T04:00:00.000Z')).result;
 const before=await visitor.world();
 const rejected=await visitor.command('office.shift.copy_week',{from_date:'2026-10-05',to_date:'2026-10-12'});
 assert.equal(rejected.response.status,409);
 assert.equal(rejected.body.error.code,'office_time_conflict');
 assert.deepEqual(await visitor.world(),before);
 await visitor.apply('office.shift.cancel',{id:conflict});
 const ready=await visitor.world();
 const copied=await visitor.apply('office.shift.copy_week',{from_date:'2026-10-05',to_date:'2026-10-12'});
 const newRows=copied.workspace.administration.shifts.filter((row:any)=>!ready.administration.shifts.some((old:any)=>old.id===row.id));
 assert.equal(newRows.length,2);
 assert.deepEqual(newRows.map((row:any)=>row.start_at),['2026-10-12T00:00:00.000Z','2026-10-13T00:00:00.000Z']);
 assert.ok(newRows.every((row:any)=>row.status==='scheduled'&&row.break_minutes===30&&row.id!==first&&row.id!==second));
 assert.equal(copied.workspace.version,ready.version+1);
 assert.equal(copied.workspace.administration.attendance.length,0);
 assert.deepEqual(financialState(copied.workspace),financialState(ready));
 const stable=await visitor.world();
 assert.equal((await visitor.command('office.shift.copy_week',{from_date:'2026-10-06',to_date:'2026-10-19'})).response.status,422);
 assert.deepEqual(await visitor.world(),stable);
});

test('foreign references and tampered administration imports are rejected atomically with strict fields',async()=>{
 const visitor=new Visitor(),other=new Visitor();
 await visitor.setup();await visitor.apply('office.enable');
 const ids=await seedOffice(visitor,'LOCAL');
 await other.setup();await other.apply('office.enable');
 const foreign=(await other.apply('office.unit.create',{name:'合成：其他訪客單位',kind:'branch'})).result;
 const before=await visitor.world();
 const foreignCommand=await visitor.command('office.staff.create',{code:'SIM-FOREIGN',alias:'合成：錯誤引用',unit_id:foreign});
 assert.equal(foreignCommand.response.status,404);
 assert.equal(foreignCommand.body.error.code,'office_record_missing');
 const invalidField=await visitor.command('office.request.prepare',{id:ids.request,checker_id:randomUUID()});
 assert.equal(invalidField.response.status,422);
 assert.equal(invalidField.body.error.code,'office_fields_invalid');
 assert.deepEqual(await visitor.world(),before);
 for(const module of ['administration','inventory']){
  const duplicated=structuredClone(before);
  duplicated.modules.push(module);
  const result=await visitor.post('import',{workspace:duplicated});
  assert.equal(result.response.status,422,JSON.stringify(result.body));
  const unchanged=await visitor.view();
  assert.equal(unchanged.body.version,before.version);
  assert.deepEqual(unchanged.body.workspace,before);
 }
 const mutations:((world:any)=>void)[]=[
  world=>{world.administration.extra='pretend authorization';},
  world=>{world.administration.staff[0].unit_id=foreign;},
  world=>{world.administration.units[0].id=world.products[0].id;},
  world=>{world.administration.staff[0].national_id='synthetic-forbidden-field';},
  world=>{world.administration.shifts[0].start_at='2026-10-05T14:00:30.000Z';},
  world=>{world.administration.attendance[0].end_at='2026-10-07T15:00:00.000Z';},
  world=>{world.administration.requests[0].status='approved';},
  world=>{world.administration.requests[0].currency='TWD';},
  world=>{world.administration.requests[0].amount_minor=-1;},
  world=>{world.administration.notices[0].due_at='2026-02-30T01:00:00.000Z';},
  world=>{world.administration.reservations.push({...world.administration.reservations[0],id:randomUUID()});},
  world=>{world.modules=world.modules.filter((module:string)=>module!=='administration');},
  world=>{
   const unit=world.administration.units[0];
   world.administration.units=[unit,...Array.from({length:50},(_,index)=>({...unit,id:randomUUID(),name:'合成：超量單位 '+index}))];
  }
 ];
 for(const mutate of mutations){
  const corrupted=structuredClone(before);mutate(corrupted);
  const result=await visitor.post('import',{workspace:corrupted});
  assert.ok([404,409,422].includes(result.response.status),JSON.stringify(result.body));
  assert.deepEqual(await visitor.world(),before);
 }
 assert.deepEqual((await other.world()).administration.staff,[]);
});

test('clear retires administration with its generation and a replay cannot resurrect its data',async()=>{
 const visitor=new Visitor();
 await visitor.setup();
 const key=randomUUID(),version=visitor.version,body={action:'office.enable',payload:{}};
 const enabled=await visitor.post('commands',body,key,version);
 assert.equal(enabled.response.status,200);
 await visitor.apply('office.unit.create',{name:'合成：清除前單位',kind:'department'});
 const old=await visitor.world(),oldCsrf=visitor.csrf;
 const cleared=await visitor.post('clear',{});
 assert.equal(cleared.response.status,200);
 assert.equal(cleared.body.workspace,null);
 assert.equal(cleared.body.version,old.version+1);
 assert.notEqual(visitor.csrf,oldCsrf);
 const replay=await visitor.post('commands',body,key,version);
 assert.equal(replay.response.status,200);
 assert.equal(replay.body.replayed,true);
 assert.equal(replay.body.workspace,null);
 const fresh=await visitor.post('setup',{industry:'retail',company_name:'合成：新一代'});
 assert.equal(fresh.response.status,200);
 assert.notEqual(fresh.body.workspace.generation_id,old.generation_id);
 assert.equal(fresh.body.workspace.administration,undefined);
 const reenabled=await visitor.apply('office.enable');
 for(const collection of collections)assert.deepEqual(reenabled.workspace.administration[collection],[]);
 assert.deepEqual(reenabled.workspace.ledger,[]);
});

test('stored administration survives a runtime restart without seeding or changing legacy money again',async()=>{
 const storage=storagePath();
 const bindings={PUBLIC_DEMO:'false',AUTO_SETUP:'false',DEFAULT_INDUSTRY:'general',DEFAULT_COMPANY:'不可重新初始化'};
 let savedRuntime=runtime(bindings,storage);
 const visitor=new Visitor(savedRuntime);
 let expected:any;
 try{
  const initial=await visitor.setup();
  const business=initial.wallets.find((row:any)=>row.kind==='business');
  await visitor.apply('wallet.fund',{wallet_id:business.id,amount_minor:98700});
  await visitor.apply('office.enable');
  await visitor.apply('office.unit.create',{name:'合成：重啟仍存在',kind:'department'});
  expected=await visitor.world();
 }finally{await savedRuntime.dispose();}
 savedRuntime=runtime({...bindings,AUTO_SETUP:'true'},storage);
 visitor.runtime=savedRuntime;
 try{
  const restarted=await visitor.view();
  assert.equal(restarted.response.status,200);
  assert.deepEqual(restarted.body.workspace,expected);
  assert.equal(restarted.body.version,expected.version);
  assert.equal(restarted.body.retention_hours,null);
  assert.equal(restarted.body.expires_at,null);
  assert.deepEqual(financialState(restarted.body.workspace),financialState(expected));
 }finally{await savedRuntime.dispose();}
});
