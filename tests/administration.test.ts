import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {command,createWorld,report,validateWorld} from '../src/engine.js';
import {createAdministration,validateAdministration} from '../src/administration.js';

const start='2026-10-05T09:00:00+08:00',end='2026-10-05T10:00:00+08:00';
type Fixture = {w:any; unit:string; staff:string; otherStaff:string};
function step(f:{w:any},action:string,p:any):string {
  const result=command(f.w,action,p);f.w=result.workspace;return result.result;
}
function fixture():Fixture {
  const f:Fixture={w:createWorld('general','行政示範工作台'),unit:'',staff:'',otherStaff:''};
  f.unit=step(f,'office.unit.create',{name:'示範門市',kind:'branch'});
  f.staff=step(f,'office.staff.create',{code:'SIM-01',alias:'示範夥伴甲',unit_id:f.unit,role_label:'行政'});
  f.otherStaff=step(f,'office.staff.create',{code:'SIM-02',alias:'示範夥伴乙',unit_id:f.unit});
  return f;
}
function timePayload(f:Fixture,extra:any={}) {return {staff_id:f.staff,unit_id:f.unit,start_at:start,end_at:end,...extra};}
function rejectedWithoutChange(f:{w:any},action:string,p:any) {
  const saved=JSON.stringify(f.w);assert.throws(()=>command(f.w,action,p));assert.equal(JSON.stringify(f.w),saved);
}

test('administration is an explicit versioned empty extension and legacy disabled worlds stay valid',()=>{
  const a=createAdministration();assert.equal(a.format,'freedom-administration-v1');
  assert.deepEqual(Object.keys(a).sort(),['format','units','staff','shifts','attendance','requests','equipment','reservations','notices','changes'].sort());
  const enabled=createWorld('general','行政測試',['administration']);assert.deepEqual(enabled.administration,a);validateWorld(enabled);
  const legacy=createWorld('retail','舊工作台');assert.equal(Object.hasOwn(legacy,'administration'),false);validateWorld(legacy);
  const f={w:legacy};rejectedWithoutChange(f,'office.unit.create',{name:'甲',kind:'branch'});
  assert.throws(()=>validateAdministration({...legacy,administration:a}));
  const absent=structuredClone(enabled);delete absent.administration;assert.throws(()=>validateWorld(absent));
});

test('office.enable accepts only empty payload and changes the cloned world once',()=>{
  const f={w:createWorld('retail','舊門市')};
  rejectedWithoutChange(f,'office.enable',{administration:createAdministration()});
  const before=f.w;const generation=f.w.generation_id;assert.equal(step(f,'office.enable',{}),generation);
  assert.equal(Object.hasOwn(before,'administration'),false);assert(f.w.modules.includes('administration'));assert.deepEqual(f.w.administration,createAdministration());
  rejectedWithoutChange(f,'office.enable',{});validateWorld(f.w);
});

test('unit and staff records use derived ids, timestamps and immutable identity fields',()=>{
  const f=fixture();const staff=f.w.administration.staff[0];assert.match(staff.id,/^[0-9a-f-]{36}$/);assert.equal(staff.status,'active');assert.equal(staff.created_at,staff.updated_at);
  step(f,'office.staff.update',{id:f.staff,alias:'示範夥伴甲一',role_label:'櫃台'});
  assert.equal(f.w.administration.staff[0].alias,'示範夥伴甲一');assert.equal(f.w.administration.staff[0].unit_id,f.unit);
  for(const p of [{code:'NEW'},{unit_id:randomUUID()},{email:'person@example.test'},{salary_minor:1},{bank_account:'SIM'}])rejectedWithoutChange(f,'office.staff.update',{id:f.staff,...p});
  rejectedWithoutChange(f,'office.staff.create',{code:'SIM-01',alias:'重複代碼',unit_id:f.unit});
  rejectedWithoutChange(f,'office.staff.create',{code:'sim-01',alias:'大小寫重複',unit_id:f.unit});
  rejectedWithoutChange(f,'office.staff.create',{code:'SIM-03',alias:'狀態注入',unit_id:f.unit,status:'inactive'});
});

test('unit deactivation respects active children, staff and equipment while preserving historical references',()=>{
  const f=fixture();const child=step(f,'office.unit.create',{name:'行政組',kind:'department',parent_id:f.unit});
  rejectedWithoutChange(f,'office.unit.update',{id:f.unit,active:false});
  step(f,'office.unit.update',{id:child,active:false});
  step(f,'office.staff.update',{id:f.staff,status:'inactive'});step(f,'office.staff.update',{id:f.otherStaff,status:'inactive'});
  const equipment=step(f,'office.equipment.create',{code:'EQ-01',name:'示範筆電',unit_id:f.unit});
  rejectedWithoutChange(f,'office.unit.update',{id:f.unit,active:false});step(f,'office.equipment.update',{id:equipment,state:'retired'});
  step(f,'office.unit.update',{id:f.unit,name:'保留歷史門市',active:false});validateWorld(f.w);
  rejectedWithoutChange(f,'office.staff.create',{code:'SIM-03',alias:'新夥伴',unit_id:f.unit});
  rejectedWithoutChange(f,'office.unit.update',{id:child,active:true});
  step(f,'office.unit.update',{id:f.unit,active:true});step(f,'office.unit.update',{id:child,active:true});
});

test('unit import rejects cycles, foreign parents and mutable hierarchy payloads',()=>{
  const f=fixture();const child=step(f,'office.unit.create',{name:'行政組',kind:'department',parent_id:f.unit});
  rejectedWithoutChange(f,'office.unit.update',{id:f.unit,parent_id:child});
  const cycle=structuredClone(f.w);cycle.administration.units[0].parent_id=child;assert.throws(()=>validateWorld(cycle));
  const foreign=structuredClone(f.w);foreign.administration.units[1].parent_id=randomUUID();assert.throws(()=>validateWorld(foreign));
});

test('planned shifts and manually entered actual attendance are separate records',()=>{
  const f=fixture();const shift=step(f,'office.shift.create',timePayload(f,{break_minutes:10,note:'示範排班'}));
  const attendance=step(f,'office.attendance.create',timePayload(f,{break_minutes:5,note:'人工輸入的示範出勤'}));
  assert.notEqual(shift,attendance);step(f,'office.shift.complete',{id:shift});
  assert.equal(f.w.administration.attendance.length,1);assert.equal(f.w.administration.shifts[0].status,'completed');
  rejectedWithoutChange(f,'office.shift.complete',{id:shift});rejectedWithoutChange(f,'office.shift.cancel',{id:shift});validateWorld(f.w);
});

test('shift completion never fabricates actual attendance',()=>{
  const f=fixture();const id=step(f,'office.shift.create',timePayload(f));step(f,'office.shift.complete',{id});
  assert.equal(f.w.administration.attendance.length,0);assert.equal(f.w.administration.shifts[0].status,'completed');
});

test('shift overlap uses half-open intervals and cancellation frees the slot',()=>{
  const f=fixture();const first=step(f,'office.shift.create',timePayload(f));
  rejectedWithoutChange(f,'office.shift.create',timePayload(f,{start_at:'2026-10-05T09:30:00+08:00',end_at:'2026-10-05T10:30:00+08:00'}));
  step(f,'office.shift.create',timePayload(f,{start_at:end,end_at:'2026-10-05T11:00:00+08:00'}));
  step(f,'office.shift.create',timePayload(f,{staff_id:f.otherStaff}));
  step(f,'office.shift.cancel',{id:first});step(f,'office.shift.create',timePayload(f));
  rejectedWithoutChange(f,'office.shift.cancel',{id:first});validateWorld(f.w);
});

test('actual attendance overlap is independent and accepts a cross-midnight interval',()=>{
  const f=fixture();step(f,'office.attendance.create',timePayload(f,{start_at:'2026-10-05T23:00:00+08:00',end_at:'2026-10-06T02:00:00+08:00',break_minutes:30}));
  rejectedWithoutChange(f,'office.attendance.create',timePayload(f,{start_at:'2026-10-06T01:59:00+08:00',end_at:'2026-10-06T03:00:00+08:00'}));
  step(f,'office.attendance.create',timePayload(f,{start_at:'2026-10-06T02:00:00+08:00',end_at:'2026-10-06T03:00:00+08:00'}));validateWorld(f.w);
});

test('intervals reject invalid calendar dates, missing offsets, seconds, excess duration and breaks',()=>{
  const f=fixture();
  const invalid=[{start_at:'2026-02-30T09:00:00+08:00',end_at:'2026-03-02T10:00:00+08:00'},
    {start_at:'2026-10-05T09:00:00'}, {start_at:'2026-10-05T09:00:01+08:00'},
    {start_at:'2026-10-05T09:00:00.001+08:00'}, {end_at:start}, {end_at:'2026-10-07T09:01:00+08:00'},
    {break_minutes:-1},{break_minutes:0.5},{break_minutes:60},{break_minutes:null}];
  for(const extra of invalid)rejectedWithoutChange(f,'office.attendance.create',timePayload(f,extra));
  step(f,'office.attendance.create',timePayload(f,{end_at:'2026-10-07T09:00:00+08:00',break_minutes:0}));validateWorld(f.w);
});

test('new time entries require an active staff member belonging to the chosen active unit',()=>{
  const f=fixture();const unit=step(f,'office.unit.create',{name:'另一門市',kind:'branch'});
  rejectedWithoutChange(f,'office.shift.create',timePayload(f,{unit_id:unit}));
  rejectedWithoutChange(f,'office.attendance.create',timePayload(f,{staff_id:randomUUID()}));
  step(f,'office.staff.update',{id:f.staff,status:'inactive'});
  rejectedWithoutChange(f,'office.attendance.create',timePayload(f));rejectedWithoutChange(f,'office.shift.create',timePayload(f));
});

test('scheduled obligations prevent staff deactivation but completed records remain as history',()=>{
  const f=fixture();const id=step(f,'office.shift.create',timePayload(f));
  rejectedWithoutChange(f,'office.staff.update',{id:f.staff,status:'inactive'});
  step(f,'office.shift.complete',{id});step(f,'office.staff.update',{id:f.staff,status:'inactive'});validateWorld(f.w);
  assert.equal(f.w.administration.shifts[0].staff_id,f.staff);
});

test('week copying uses Taipei civil Mondays and copies completed shifts into fresh planned rows',()=>{
  const f=fixture();const source=step(f,'office.shift.create',timePayload(f,{start_at:'2026-10-04T16:00:00Z',end_at:'2026-10-04T17:00:00Z'}));
  step(f,'office.shift.complete',{id:source});const cancelled=step(f,'office.shift.create',timePayload(f));step(f,'office.shift.cancel',{id:cancelled});
  const copied=step(f,'office.shift.copy_week',{from_date:'2026-10-05',to_date:'2026-10-12'});
  const row=f.w.administration.shifts.find((s:any)=>s.id===copied);assert.equal(row.start_at,'2026-10-11T16:00:00.000Z');assert.equal(row.end_at,'2026-10-11T17:00:00.000Z');assert.equal(row.status,'scheduled');assert.notEqual(row.id,source);
  assert.equal(f.w.administration.shifts.length,3);assert.equal(f.w.administration.attendance.length,0);
  for(const p of [{from_date:'2026-10-06',to_date:'2026-10-12'},{from_date:'2026-10-05',to_date:'2026-10-05'},{from_date:'2026-11-02',to_date:'2026-11-09'}])rejectedWithoutChange(f,'office.shift.copy_week',p);
});

test('week copy conflict rejects the entire batch and does not append its valid first row',()=>{
  const f=fixture();step(f,'office.shift.create',timePayload(f));
  step(f,'office.shift.create',timePayload(f,{start_at:'2026-10-05T11:00:00+08:00',end_at:'2026-10-05T12:00:00+08:00'}));
  step(f,'office.shift.create',timePayload(f,{start_at:'2026-10-12T11:30:00+08:00',end_at:'2026-10-12T12:30:00+08:00'}));
  rejectedWithoutChange(f,'office.shift.copy_week',{from_date:'2026-10-05',to_date:'2026-10-12'});assert.equal(f.w.administration.shifts.length,3);
});

test('week copy also rejects quota overflow atomically',()=>{
  const f=fixture();step(f,'office.shift.create',timePayload(f));
  const base=f.w.administration.shifts[0];for(let i=1;i<200;i++)f.w.administration.shifts.push({...base,id:randomUUID(),status:'cancelled'});
  validateWorld(f.w);rejectedWithoutChange(f,'office.shift.copy_week',{from_date:'2026-10-05',to_date:'2026-10-12'});assert.equal(f.w.administration.shifts.length,200);
});

test('requests enforce SIM amount bounds and leave-specific references and dates',()=>{
  const f=fixture();step(f,'office.request.create',{type:'general',unit_id:f.unit,title:'示範一般申請'});
  assert.equal(f.w.administration.requests[0].amount_minor,0);assert.equal(f.w.administration.requests[0].currency,'SIM');
  const leave={type:'leave',staff_id:f.staff,unit_id:f.unit,title:'示範請假',start_at:start,end_at:end,amount_minor:0};step(f,'office.request.create',leave);
  for(const extra of [{amount_minor:1},{staff_id:null},{start_at:null},{end_at:null}])rejectedWithoutChange(f,'office.request.create',{...leave,...extra});
  for(const amount_minor of [0,-1,0.5,1e9+1,Number.MAX_SAFE_INTEGER])rejectedWithoutChange(f,'office.request.create',{type:'expense',unit_id:f.unit,title:'示範費用',amount_minor});
  step(f,'office.request.create',{type:'purchase',unit_id:f.unit,title:'示範採購',amount_minor:1e9});
  rejectedWithoutChange(f,'office.request.create',{type:'general',unit_id:f.unit,title:'幣別注入',currency:'SIM'});
});

test('seven-day fictional leave is a record without approval or money movement and remains bounded to 31 days',()=>{
  const f=fixture();const finance=JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases});
  const p={type:'leave',staff_id:f.staff,unit_id:f.unit,title:'一週示範請假',start_at:start,end_at:'2026-10-12T09:00:00+08:00',amount_minor:0};
  const id=step(f,'office.request.create',p);assert.equal(f.w.administration.requests[0].status,'draft');
  step(f,'office.request.submit',{id});step(f,'office.request.prepare',{id});
  assert.equal(f.w.administration.requests[0].status,'prepared_unreviewed');rejectedWithoutChange(f,'office.request.approve',{id});
  step(f,'office.request.create',{...p,title:'31 天示範請假',end_at:'2026-11-05T09:00:00+08:00'});
  rejectedWithoutChange(f,'office.request.create',{...p,end_at:'2026-11-05T09:01:00+08:00'});
  rejectedWithoutChange(f,'office.request.create',{...p,end_at:'2026-11-06T09:00:00+08:00'});
  const otherUnit=step(f,'office.unit.create',{name:'另一門市',kind:'branch'});
  rejectedWithoutChange(f,'office.request.create',{...p,unit_id:otherUnit});
  rejectedWithoutChange(f,'office.request.create',{...p,end_at:'2026-10-12T09:00:01+08:00'});
  assert.equal(JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases}),finance);validateWorld(f.w);
});

test('prepared requests are terminal unreviewed records and never move wallet money',()=>{
  const f=fixture();const finance=JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases});
  const id=step(f,'office.request.create',{type:'expense',staff_id:f.staff,unit_id:f.unit,title:'示範費用',amount_minor:2500});
  rejectedWithoutChange(f,'office.request.prepare',{id});step(f,'office.request.submit',{id});
  rejectedWithoutChange(f,'office.request.update',{id,amount_minor:3000});step(f,'office.request.prepare',{id});
  assert.equal(f.w.administration.requests.find((r:any)=>r.id===id).status,'prepared_unreviewed');
  assert.equal(JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases}),finance);
  for(const action of ['office.request.prepare','office.request.submit','office.request.withdraw'])rejectedWithoutChange(f,action,{id});
  rejectedWithoutChange(f,'office.request.approve',{id});rejectedWithoutChange(f,'office.request.create',{type:'general',unit_id:f.unit,title:'核准注入',status:'approved'});
});

test('request return needs a reason and returned edits can be resubmitted or withdrawn',()=>{
  const f=fixture();const id=step(f,'office.request.create',{type:'general',unit_id:f.unit,title:'示範一般申請'});
  rejectedWithoutChange(f,'office.request.return',{id,processing_note:'補充內容'});step(f,'office.request.submit',{id});
  rejectedWithoutChange(f,'office.request.return',{id,processing_note:'  '});rejectedWithoutChange(f,'office.request.return',{id});
  step(f,'office.request.return',{id,processing_note:'請補充示範說明'});step(f,'office.request.update',{id,title:'已補充示範一般申請',description:'示範內容'});
  step(f,'office.request.submit',{id});assert.equal(f.w.administration.requests[0].processing_note,'請補充示範說明');
  step(f,'office.request.withdraw',{id});assert.equal(f.w.administration.requests[0].status,'withdrawn');rejectedWithoutChange(f,'office.request.submit',{id});
});

test('submitted requests block deactivation and returned drafts need active references on resubmission',()=>{
  const f=fixture();const id=step(f,'office.request.create',{type:'general',staff_id:f.staff,unit_id:f.unit,title:'示範申請'});
  step(f,'office.request.submit',{id});rejectedWithoutChange(f,'office.staff.update',{id:f.staff,status:'inactive'});
  step(f,'office.request.return',{id,processing_note:'示範退回'});step(f,'office.staff.update',{id:f.staff,status:'inactive'});
  rejectedWithoutChange(f,'office.request.submit',{id});validateWorld(f.w);
});

test('request transition history retains every returned reason through draft edits, resubmissions and preparation',()=>{
  const f=fixture();const finance=JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases});
  const id=step(f,'office.request.create',{type:'general',staff_id:f.staff,unit_id:f.unit,title:'示範行政申請'});
  assert.deepEqual(f.w.administration.requests[0].transitions,[{status:'draft',at:f.w.administration.requests[0].created_at,note:''}]);
  step(f,'office.request.update',{id,description:'第一次草稿補充'});assert.equal(f.w.administration.requests[0].transitions.length,1);
  step(f,'office.request.submit',{id});step(f,'office.request.return',{id,processing_note:'原因 A：補充用途'});
  step(f,'office.request.update',{id,description:'補充示範用途'});assert.equal(f.w.administration.requests[0].status,'draft');
  step(f,'office.request.submit',{id});step(f,'office.request.return',{id,processing_note:'原因 B：補充日期'});
  step(f,'office.request.submit',{id});step(f,'office.request.prepare',{id});
  const row=f.w.administration.requests[0];
  assert.equal(row.status,'prepared_unreviewed');assert.equal(row.processing_note,'原因 B：補充日期');
  assert.deepEqual(row.transitions.map((t:any)=>t.status),['draft','submitted','returned','draft','submitted','returned','submitted','prepared_unreviewed']);
  assert.deepEqual(row.transitions.filter((t:any)=>t.status==='returned').map((t:any)=>t.note),['原因 A：補充用途','原因 B：補充日期']);
  assert(row.transitions.every((t:any)=>t.status==='returned' || t.note===''));
  assert.equal(JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases}),finance);
  rejectedWithoutChange(f,'office.request.create',{type:'general',unit_id:f.unit,title:'注入狀態紀錄',transitions:row.transitions});
  rejectedWithoutChange(f,'office.request.update',{id,transitions:[]});validateWorld(f.w);
});

test('request transition imports reject unknown fields, altered lifecycle, timing, reasons and event quotas',()=>{
  const f=fixture();const id=step(f,'office.request.create',{type:'general',unit_id:f.unit,title:'狀態紀錄驗證'});
  step(f,'office.request.submit',{id});step(f,'office.request.return',{id,processing_note:'保留示範退回原因'});
  const mutations=[(r:any)=>delete r.transitions,(r:any)=>r.transitions=[],
    (r:any)=>r.transitions[0].actor_id='injected',(r:any)=>r.transitions[0].status='submitted',
    (r:any)=>r.transitions[0].at='2000-01-01T00:00:00Z',(r:any)=>r.transitions[1].at='2000-01-01T00:00:00Z',
    (r:any)=>r.transitions[1].status='draft',(r:any)=>r.transitions[2].status='approved',
    (r:any)=>r.status='submitted',(r:any)=>r.transitions[2].note='',
    (r:any)=>r.transitions[1].note='非退回原因',(r:any)=>r.processing_note='',
    (r:any)=>r.transitions[2].at='2099-01-01T00:00:00Z',
    (r:any)=>r.transitions=Array.from({length:51},()=>({...r.transitions[0]}))];
  for(const mutate of mutations){const w=structuredClone(f.w);mutate(w.administration.requests[0]);assert.throws(()=>validateWorld(w));}
  const row=f.w.administration.requests[0];const at=row.created_at;
  row.transitions=[{status:'draft',at,note:''}];
  for(let i=0;i<24;i++)row.transitions.push({status:'submitted',at,note:''},{status:'returned',at,note:`示範原因 ${i}`});
  row.transitions.push({status:'submitted',at,note:''});row.status='submitted';row.processing_note='示範原因 23';
  assert.equal(row.transitions.length,50);validateWorld(f.w);
  rejectedWithoutChange(f,'office.request.return',{id,processing_note:'第 51 筆應拒絕'});assert.equal(f.w.administration.requests[0].transitions.length,50);
});

test('import rejects duplicate administration modules even with valid administrative data',()=>{
  const f=fixture();f.w.modules.push('administration');assert.throws(()=>validateWorld(f.w));
});

test('equipment booking rejects overlap and maintenance until the reservation is returned',()=>{
  const f=fixture();const equipment=step(f,'office.equipment.create',{code:'EQ-01',name:'示範筆電',unit_id:f.unit});
  const p={equipment_id:equipment,staff_id:f.staff,start_at:start,end_at:end,purpose:'示範借用'};const id=step(f,'office.reservation.create',p);
  rejectedWithoutChange(f,'office.reservation.create',{...p,staff_id:f.otherStaff});
  step(f,'office.reservation.create',{...p,start_at:end,end_at:'2026-10-05T11:00:00+08:00'});
  rejectedWithoutChange(f,'office.equipment.update',{id:equipment,state:'maintenance'});rejectedWithoutChange(f,'office.staff.update',{id:f.staff,status:'inactive'});
  step(f,'office.reservation.return',{id});rejectedWithoutChange(f,'office.reservation.return',{id});
  const second=f.w.administration.reservations[1].id;step(f,'office.reservation.cancel',{id:second});step(f,'office.equipment.update',{id:equipment,state:'maintenance'});
  rejectedWithoutChange(f,'office.reservation.create',p);step(f,'office.equipment.update',{id:equipment,state:'available'});step(f,'office.reservation.create',p);validateWorld(f.w);
});

test('seven-day equipment reservations retain overlap and active-staff protection with a 31-day maximum',()=>{
  const f=fixture();const finance=JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases});
  const equipment=step(f,'office.equipment.create',{code:'EQ-WEEK',name:'示範多日借用設備',unit_id:f.unit});
  const p={equipment_id:equipment,staff_id:f.staff,start_at:start,end_at:'2026-10-12T09:00:00+08:00',purpose:'一週示範借用'};
  const id=step(f,'office.reservation.create',p);assert.equal(f.w.administration.reservations[0].status,'reserved');
  rejectedWithoutChange(f,'office.reservation.create',{...p,staff_id:f.otherStaff,start_at:'2026-10-11T09:00:00+08:00',end_at:'2026-10-18T09:00:00+08:00'});
  rejectedWithoutChange(f,'office.staff.update',{id:f.staff,status:'inactive'});
  step(f,'office.reservation.return',{id});step(f,'office.staff.update',{id:f.staff,status:'inactive'});
  rejectedWithoutChange(f,'office.reservation.create',p);
  step(f,'office.reservation.create',{...p,staff_id:f.otherStaff,end_at:'2026-11-05T09:00:00+08:00'});
  rejectedWithoutChange(f,'office.reservation.create',{...p,staff_id:f.otherStaff,end_at:'2026-11-05T09:01:00+08:00'});
  rejectedWithoutChange(f,'office.reservation.create',{...p,staff_id:f.otherStaff,end_at:'2026-11-06T09:00:00+08:00'});
  assert.equal(JSON.stringify({wallets:f.w.wallets,ledger:f.w.ledger,purchases:f.w.purchases}),finance);validateWorld(f.w);
});

test('equipment codes and assignment are immutable and retired equipment preserves returned history',()=>{
  const f=fixture();const id=step(f,'office.equipment.create',{code:'EQ-01',name:'示範投影機',unit_id:f.unit});
  rejectedWithoutChange(f,'office.equipment.create',{code:'eq-01',name:'重複代碼',unit_id:f.unit});
  rejectedWithoutChange(f,'office.equipment.update',{id,unit_id:randomUUID()});rejectedWithoutChange(f,'office.equipment.update',{id,code:'NEW'});
  const reservation=step(f,'office.reservation.create',{equipment_id:id,staff_id:f.staff,start_at:start,end_at:end});step(f,'office.reservation.return',{id:reservation});
  step(f,'office.equipment.update',{id,state:'retired',name:'已封存示範投影機'});validateWorld(f.w);
});

test('notices support global scope, active unit scope, pinning and nullable due dates',()=>{
  const f=fixture();const id=step(f,'office.notice.create',{title:'全工作台示範公告'});assert.equal(f.w.administration.notices[0].unit_id,null);
  step(f,'office.notice.update',{id,body:'示範行政提醒',unit_id:f.unit,pinned:true,due_at:'2026-10-05T12:00:30+08:00'});
  assert.equal(f.w.administration.notices[0].pinned,true);step(f,'office.notice.update',{id,unit_id:null,due_at:null});
  rejectedWithoutChange(f,'office.notice.create',{title:'未知單位公告',unit_id:randomUUID()});
  rejectedWithoutChange(f,'office.notice.update',{id,pinned:'true'});rejectedWithoutChange(f,'office.notice.create',{title:'日期錯誤',due_at:'2026-02-30T00:00:00Z'});
});

test('every administrative command rejects unknown, protected and prototype payload fields',()=>{
  const f=fixture();
  for(const action of ['office.unit.create','office.staff.create','office.shift.create','office.attendance.create','office.request.create','office.equipment.create','office.reservation.create','office.notice.create']){
    rejectedWithoutChange(f,action,{id:randomUUID(),created_at:new Date().toISOString(),unknown:'injected'});
  }
  const proto=JSON.parse('{"title":"示範公告","__proto__":{"polluted":true}}');rejectedWithoutChange(f,'office.notice.create',proto);
  for(const extra of [{email:'person@example.test'},{identity_number:'FAKE'},{bank_account:'FAKE'},{approved:true},{currency:'SIM'},{body:null}])rejectedWithoutChange(f,'office.notice.create',{title:'示範公告',...extra});
  rejectedWithoutChange(f,'office.notice.update',{id:randomUUID()});assert.equal(({} as any).polluted,undefined);
});

test('import rejects administrative schema mutations, invalid references, status and amount tampering',()=>{
  const f=fixture();step(f,'office.request.create',{type:'expense',unit_id:f.unit,title:'示範費用',amount_minor:100});
  const mutations=[(w:any)=>w.administration.format='v2', (w:any)=>w.administration.extra=[],
    (w:any)=>delete w.administration.staff[0].updated_at, (w:any)=>w.administration.staff[0].email='person@example.test',
    (w:any)=>w.administration.staff[0].unit_id=randomUUID(), (w:any)=>w.administration.requests[0].status='approved',
    (w:any)=>w.administration.requests[0].currency='TWD', (w:any)=>w.administration.requests[0].amount_minor=0,
    (w:any)=>w.administration.units[0].active=false, (w:any)=>w.administration.staff[0].id='fake',
    (w:any)=>w.administration.staff[0].updated_at='2000-01-01T00:00:00Z',
    (w:any)=>Object.defineProperty(w.administration.units[0],'constructor',{value:{},enumerable:true})];
  for(const mutate of mutations){const w=structuredClone(f.w);mutate(w);assert.throws(()=>validateWorld(w));}
  validateWorld(f.w);
});

test('administrative ids cannot collide with legacy rows, nested followups or another administration collection',()=>{
  const f=fixture();step(f,'followup.create',{deal_id:f.w.deals[0].id,note:'示範 CRM 追蹤'});
  const legacy=[f.w.customers[0].id,f.w.history[0].id,f.w.deals[0].followups[0].id,f.w.administration.units[0].id,f.w.administration.units[0].id.toUpperCase()];
  for(const id of legacy){const w=structuredClone(f.w);w.administration.staff[0].id=id;assert.throws(()=>validateWorld(w));}
});

test('import enforces per-collection quotas and successful records survive a JSON round trip',()=>{
  const f=fixture();step(f,'office.notice.create',{title:'示範公告'});const base=f.w.administration.notices[0];
  const excessive=structuredClone(f.w);excessive.administration.notices=Array.from({length:101},()=>({...base,id:randomUUID()}));assert.throws(()=>validateWorld(excessive));
  const units=structuredClone(f.w);units.administration.units=Array.from({length:51},(_,i)=>({...units.administration.units[0],id:i===0?f.unit:randomUUID(),name:`示範單位${i}`}));assert.throws(()=>validateWorld(units));
  const restored=JSON.parse(JSON.stringify(f.w));validateWorld(restored);assert.deepEqual(restored.administration,f.w.administration);
});

test('published format1 records validate without changes or flags and normalize only in a successful office command',()=>{
  const f=fixture();step(f,'office.attendance.create',timePayload(f));const notice=step(f,'office.notice.create',{title:'舊版示範公告'});
  delete f.w.administration.changes;delete f.w.administration.attendance[0].voided;delete f.w.administration.notices[0].archived;
  const saved=JSON.stringify(f.w);validateWorld(f.w);report(f.w);assert.equal(JSON.stringify(f.w),saved);
  rejectedWithoutChange(f,'office.attendance.update',{id:f.w.administration.attendance[0].id,note:'未提供理由'});
  const old=f.w;step(f,'office.notice.update',{id:notice,body:'更新舊版示範公告'});
  assert.equal(JSON.stringify(old),saved);assert.deepEqual(f.w.administration.changes,[]);
  assert.equal(f.w.administration.attendance[0].voided,false);assert.equal(f.w.administration.notices[0].archived,false);validateWorld(f.w);
});

test('scheduled shift rescheduling preserves old values and rejects conflicts or incomplete correction payloads atomically',()=>{
  const f=fixture();const id=step(f,'office.shift.create',timePayload(f));
  const next=step(f,'office.shift.create',timePayload(f,{start_at:'2026-10-05T11:00:00+08:00',end_at:'2026-10-05T12:00:00+08:00'}));
  step(f,'office.shift.update',{id,start_at:end,end_at:'2026-10-05T11:00:00+08:00',note:'更正後示範排班',reason:'示範人力調整'});
  const log=f.w.administration.changes[0];assert.equal(log.kind,'shift.update');assert.equal(log.record_id,id);assert.equal(log.before.start_at,start);assert.equal(log.after.start_at,end);assert.equal(log.reason,'示範人力調整');
  assert.equal(log.at,log.after.updated_at);assert.notEqual(log.id,id);
  for(const p of [{start_at:'2026-10-05T10:30:00+08:00',end_at:'2026-10-05T11:30:00+08:00',reason:'衝突更正'},
    {note:'未填理由'},{note:'空理由',reason:'  '},{reason:'只有理由'},{note:'更正後示範排班',reason:'無變更'},
    {staff_id:f.otherStaff,reason:'改變所屬'},{status:'completed',reason:'注入狀態'}])rejectedWithoutChange(f,'office.shift.update',{id,...p});
  assert.equal(f.w.administration.changes.length,1);step(f,'office.shift.cancel',{id});step(f,'office.shift.cancel',{id:next});
  rejectedWithoutChange(f,'office.shift.update',{id,note:'已取消班次',reason:'錯誤更正'});
  step(f,'office.staff.update',{id:f.staff,status:'inactive'});validateWorld(f.w);
});

test('future scheduled shifts cannot be marked complete while cancellation stays available',()=>{
  const f=fixture();const id=step(f,'office.shift.create',timePayload(f,{start_at:'2099-10-05T09:00:00+08:00',end_at:'2099-10-05T10:00:00+08:00'}));
  const saved=JSON.stringify(f.w);assert.throws(()=>command(f.w,'office.shift.complete',{id}),(error:any)=>error.code==='office_shift_not_finished');
  assert.equal(JSON.stringify(f.w),saved);assert.equal(f.w.administration.attendance.length,0);step(f,'office.shift.cancel',{id});
});

test('attendance corrections and voids retain the complete chain and allow a replacement record',()=>{
  const f=fixture();const id=step(f,'office.attendance.create',timePayload(f,{note:'原始示範出勤'}));
  step(f,'office.attendance.update',{id,end_at:'2026-10-05T11:00:00+08:00',break_minutes:20,note:'更正後示範出勤',reason:'補正示範時間'});
  rejectedWithoutChange(f,'office.attendance.create',timePayload(f));
  step(f,'office.attendance.void',{id,reason:'重複輸入，保留原始紀錄'});assert.equal(f.w.administration.attendance[0].voided,true);
  const replacement=step(f,'office.attendance.create',timePayload(f));assert.notEqual(replacement,id);
  const logs=f.w.administration.changes;assert.equal(logs.length,2);assert.equal(logs[0].before.note,'原始示範出勤');assert.deepEqual(logs[1].before,logs[0].after);
  assert.equal(logs[1].after.voided,true);assert.equal(logs[1].reason,'重複輸入，保留原始紀錄');
  rejectedWithoutChange(f,'office.attendance.void',{id,reason:'再次作廢'});rejectedWithoutChange(f,'office.attendance.update',{id,note:'重新更正',reason:'不可改作廢紀錄'});
  rejectedWithoutChange(f,'office.attendance.update',{id:replacement,voided:true,reason:'注入作廢狀態'});validateWorld(f.w);
});

test('attendance correction rejects overlap without changing row values or appending an audit log',()=>{
  const f=fixture();const id=step(f,'office.attendance.create',timePayload(f));
  step(f,'office.attendance.create',timePayload(f,{start_at:'2026-10-05T11:00:00+08:00',end_at:'2026-10-05T12:00:00+08:00'}));
  rejectedWithoutChange(f,'office.attendance.update',{id,end_at:'2026-10-05T11:01:00+08:00',reason:'重疊更正'});
  rejectedWithoutChange(f,'office.attendance.update',{id,staff_id:f.otherStaff,reason:'改變所屬'});
  assert.equal(f.w.administration.changes.length,0);assert.equal(f.w.administration.attendance[0].end_at,end);
});

test('reservation rescheduling keeps equipment and staff immutable and preserves the trace after return',()=>{
  const f=fixture();const equipment=step(f,'office.equipment.create',{code:'EQ-MOVE',name:'示範改期設備',unit_id:f.unit});
  const p={equipment_id:equipment,staff_id:f.staff,start_at:start,end_at:end};const id=step(f,'office.reservation.create',p);
  const other=step(f,'office.reservation.create',{...p,start_at:'2026-10-05T12:00:00+08:00',end_at:'2026-10-05T13:00:00+08:00'});
  step(f,'office.reservation.update',{id,start_at:'2026-10-05T10:00:00+08:00',end_at:'2026-10-05T12:00:00+08:00',purpose:'調整後示範借用',reason:'示範改期'});
  assert.equal(f.w.administration.changes[0].before.start_at,start);assert.equal(f.w.administration.changes[0].after.purpose,'調整後示範借用');
  for(const extra of [{end_at:'2026-10-05T12:01:00+08:00'},{staff_id:f.otherStaff},{equipment_id:randomUUID()}])rejectedWithoutChange(f,'office.reservation.update',{id,...extra,reason:'不可更正'});
  step(f,'office.reservation.return',{id});step(f,'office.reservation.cancel',{id:other});step(f,'office.equipment.update',{id:equipment,state:'retired'});
  rejectedWithoutChange(f,'office.reservation.update',{id,purpose:'歸還後更正',reason:'不可更正'});validateWorld(f.w);
});

test('notice archive and restore preserve records with server reasons and keep a consistent history after edits',()=>{
  const f=fixture();const id=step(f,'office.notice.create',{title:'示範重要公告',body:'原始示範內容',pinned:true});
  step(f,'office.notice.archive',{id});assert.equal(f.w.administration.notices.length,1);assert.equal(f.w.administration.notices[0].archived,true);
  rejectedWithoutChange(f,'office.notice.archive',{id});rejectedWithoutChange(f,'office.notice.restore',{id,reason:'自填理由'});
  step(f,'office.notice.update',{id,body:'已整理示範內容'});step(f,'office.notice.restore',{id});
  const logs=f.w.administration.changes;assert.deepEqual(logs.map((r:any)=>r.kind),['notice.archive','notice.restore']);
  assert.deepEqual(logs.map((r:any)=>r.reason),['封存公告','還原公告']);assert.equal(logs[1].before.body,'已整理示範內容');
  assert.equal(f.w.administration.notices[0].archived,false);rejectedWithoutChange(f,'office.notice.restore',{id});validateWorld(f.w);
});

test('reports exclude voided attendance and archived pinned notices without removing their records',()=>{
  const f=fixture();const attendance=step(f,'office.attendance.create',timePayload(f,{break_minutes:10}));const notice=step(f,'office.notice.create',{title:'示範置頂公告',pinned:true});
  const officeReport=()=>{const value=report(f.w);assert('administration' in value);return value.administration;};
  assert.equal(officeReport().actual_work_minutes,50);assert.equal(officeReport().pinned_notices,1);
  step(f,'office.attendance.void',{id:attendance,reason:'示範作廢'});step(f,'office.notice.archive',{id:notice});
  assert.equal(officeReport().actual_work_minutes,0);assert.equal(officeReport().pinned_notices,0);
  assert.equal(f.w.administration.attendance.length,1);assert.equal(f.w.administration.notices.length,1);
  step(f,'office.notice.restore',{id:notice});assert.equal(officeReport().pinned_notices,1);
});

test('change import rejects forged keys, identities, reference assignments, times and mismatched snapshots',()=>{
  const f=fixture();const id=step(f,'office.attendance.create',timePayload(f));step(f,'office.attendance.update',{id,note:'更正後示範',reason:'示範更正'});
  const mutations=[(w:any)=>w.administration.changes[0].actor_id='injected',
    (w:any)=>w.administration.changes[0].before.bank_account='injected',
    (w:any)=>w.administration.changes[0].before.id=randomUUID(),
    (w:any)=>w.administration.changes[0].after.staff_id=f.otherStaff,
    (w:any)=>w.administration.changes[0].before.unit_id=randomUUID(),
    (w:any)=>w.administration.changes[0].after.created_at='2000-01-01T00:00:00Z',
    (w:any)=>w.administration.changes[0].at='2099-01-01T00:00:00Z',
    (w:any)=>w.administration.changes[0].after.updated_at='2099-01-01T00:00:00Z',
    (w:any)=>w.administration.changes[0].after.note='與現有資料不符',
    (w:any)=>w.administration.changes[0].id=w.history[0].id,
    (w:any)=>w.administration.changes[0].reason='',
    (w:any)=>w.administration.changes[0].kind='attendance.approve',
    (w:any)=>w.administration.changes[0].before.constructor={},
    (w:any)=>w.administration.attendance[0].voided='false',
    (w:any)=>w.administration.changes=null];
  for(const mutate of mutations){const w=structuredClone(f.w);mutate(w);assert.throws(()=>validateWorld(w));}
  step(f,'office.attendance.update',{id,note:'第二次更正',reason:'示範補正'});const broken=structuredClone(f.w);broken.administration.changes[1].before.note='斷裂的舊值';assert.throws(()=>validateWorld(broken));
  const restored=JSON.parse(JSON.stringify(f.w));validateWorld(restored);assert.deepEqual(restored.administration.changes,f.w.administration.changes);
});

test('change quota retains all 200 audit records and refuses a 201st mutation atomically',()=>{
  const f=fixture();const id=step(f,'office.attendance.create',timePayload(f));let row=structuredClone(f.w.administration.attendance[0]);
  const at=row.created_at;f.w.administration.changes=[];
  for(let i=0;i<200;i++){
    const before=structuredClone(row);row={...row,note:`示範更正 ${i}`,updated_at:at};
    f.w.administration.changes.push({id:randomUUID(),kind:'attendance.update',record_id:id,at,reason:'示範容量驗證',before,after:structuredClone(row)});
  }
  f.w.administration.attendance[0]=row;validateWorld(f.w);
  rejectedWithoutChange(f,'office.attendance.update',{id,note:'第 201 筆',reason:'超出更正紀錄上限'});
  rejectedWithoutChange(f,'office.attendance.void',{id,reason:'超出更正紀錄上限'});assert.equal(f.w.administration.changes.length,200);
  const excessive=structuredClone(f.w);excessive.administration.changes.push({...excessive.administration.changes[199],id:randomUUID()});assert.throws(()=>validateWorld(excessive));
});

test('every demo preset builds complete explicitly synthetic records without changing legacy rows or SIM money',()=>{
  for(const preset of ['store','office','factory']){
    const f={w:createWorld('general','完整示範入門')};step(f,'wallet.fund',{wallet_id:f.w.wallets[0].id,amount_minor:1000});
    const legacyNames=['products','wallets','orders','services','ledger','purchases','customers','contacts','deals','cases','quotes','tasks','milestones','boms','workOrders'];
    const legacy=JSON.stringify(Object.fromEntries(legacyNames.map(name=>[name,f.w[name]])));
    const id=step(f,'office.demo.create',{preset,week_start:'2026-09-28'}),a=f.w.administration;
    assert.deepEqual(['units','staff','shifts','attendance','requests','equipment','reservations','notices'].map(name=>a[name].length),[1,2,5,2,1,1,1,2]);
    assert.equal(id,a.units[0].id);assert.deepEqual(a.changes,[]);assert.equal(a.requests[0].status,'draft');assert.equal(a.requests[0].currency,'SIM');
    assert(a.shifts.every((r:any)=>r.status==='scheduled' && r.note.includes('合成示範')));
    assert(a.attendance.every((r:any)=>r.note.includes('非真實打卡') && r.voided===false));assert(a.staff.every((r:any)=>r.alias.includes('合成示範')));
    assert(a.notices.every((r:any)=>r.archived===false));
    assert.equal(new Date(Date.parse(a.shifts[0].start_at)+8*60*60000).toISOString().slice(0,16),'2026-09-28T09:00');
    assert.equal(JSON.stringify(Object.fromEntries(legacyNames.map(name=>[name,f.w[name]]))),legacy);
    rejectedWithoutChange(f,'office.demo.create',{preset,week_start:'2026-09-28'});validateWorld(f.w);
  }
});

test('demo refuses existing administrative data, invalid dates, extra fields and disabled modules without overwriting',()=>{
  const f={w:createWorld('general','空行政工作台')};
  for(const p of [{preset:'unknown',week_start:'2026-09-28'},{preset:'office',week_start:'2026-09-29'},
    {preset:'store',week_start:'2026-02-30'},{preset:'factory',week_start:'2026-09-28',changes:[]}])rejectedWithoutChange(f,'office.demo.create',p);
  step(f,'office.notice.create',{title:'已有示範公告'});rejectedWithoutChange(f,'office.demo.create',{preset:'office',week_start:'2026-09-28'});
  const disabled={w:createWorld('retail','未啟用行政')};rejectedWithoutChange(disabled,'office.demo.create',{preset:'store',week_start:'2026-09-28'});
});
