import {randomUUID} from 'node:crypto';
import {ok} from './problem.js';

type Stamp = {id:string; created_at:string; updated_at:string};
export type RequestStatus = 'draft'|'submitted'|'returned'|'withdrawn'|'prepared_unreviewed';
export type RequestTransition = {status:RequestStatus; at:string; note:string};
export type Administration = {
  format:'freedom-administration-v1';
  units:(Stamp & {name:string; kind:'branch'|'department'; parent_id:string|null; active:boolean})[];
  staff:(Stamp & {code:string; alias:string; unit_id:string; role_label:string; status:'active'|'inactive'})[];
  shifts:(Stamp & {staff_id:string; unit_id:string; start_at:string; end_at:string; break_minutes:number; note:string; status:'scheduled'|'completed'|'cancelled'})[];
  attendance:(Stamp & {staff_id:string; unit_id:string; start_at:string; end_at:string; break_minutes:number; note:string})[];
  requests:(Stamp & {type:'leave'|'purchase'|'expense'|'general'; staff_id:string|null; unit_id:string; title:string; description:string; amount_minor:number; currency:'SIM'; start_at:string|null; end_at:string|null; status:RequestStatus; processing_note:string; transitions:RequestTransition[]})[];
  equipment:(Stamp & {code:string; name:string; unit_id:string; state:'available'|'maintenance'|'retired'})[];
  reservations:(Stamp & {equipment_id:string; staff_id:string; start_at:string; end_at:string; purpose:string; status:'reserved'|'returned'|'cancelled'})[];
  notices:(Stamp & {title:string; body:string; unit_id:string|null; pinned:boolean; due_at:string|null})[];
};

const lists = ['units','staff','shifts','attendance','requests','equipment','reservations','notices'] as const;
const limits:Record<typeof lists[number],number> = {units:50,staff:100,shifts:200,attendance:200,requests:100,equipment:100,reservations:200,notices:100};
const stampKeys = ['id','created_at','updated_at'];
const rowKeys:Record<typeof lists[number],string[]> = {
  units:['name','kind','parent_id','active'],
  staff:['code','alias','unit_id','role_label','status'],
  shifts:['staff_id','unit_id','start_at','end_at','break_minutes','note','status'],
  attendance:['staff_id','unit_id','start_at','end_at','break_minutes','note'],
  requests:['type','staff_id','unit_id','title','description','amount_minor','currency','start_at','end_at','status','processing_note','transitions'],
  equipment:['code','name','unit_id','state'],
  reservations:['equipment_id','staff_id','start_at','end_at','purpose','status'],
  notices:['title','body','unit_id','pinned','due_at'],
};
const actions:Record<string,{required:string[]; optional?:string[]}> = {
  'office.enable':{required:[]},
  'office.unit.create':{required:['name','kind'],optional:['parent_id']},
  'office.unit.update':{required:['id'],optional:['name','active']},
  'office.staff.create':{required:['code','alias','unit_id'],optional:['role_label']},
  'office.staff.update':{required:['id'],optional:['alias','role_label','status']},
  'office.shift.create':{required:['staff_id','unit_id','start_at','end_at'],optional:['break_minutes','note']},
  'office.shift.cancel':{required:['id']},
  'office.shift.complete':{required:['id']},
  'office.shift.copy_week':{required:['from_date','to_date']},
  'office.attendance.create':{required:['staff_id','unit_id','start_at','end_at'],optional:['break_minutes','note']},
  'office.request.create':{required:['type','unit_id','title'],optional:['staff_id','description','amount_minor','start_at','end_at']},
  'office.request.update':{required:['id'],optional:['title','description','amount_minor','start_at','end_at']},
  'office.request.submit':{required:['id']},
  'office.request.return':{required:['id','processing_note']},
  'office.request.withdraw':{required:['id']},
  'office.request.prepare':{required:['id']},
  'office.equipment.create':{required:['code','name','unit_id']},
  'office.equipment.update':{required:['id'],optional:['name','state']},
  'office.reservation.create':{required:['equipment_id','staff_id','start_at','end_at'],optional:['purpose']},
  'office.reservation.return':{required:['id']},
  'office.reservation.cancel':{required:['id']},
  'office.notice.create':{required:['title'],optional:['body','unit_id','pinned','due_at']},
  'office.notice.update':{required:['id'],optional:['title','body','unit_id','pinned','due_at']},
};

export function createAdministration():Administration {
  return {format:'freedom-administration-v1',units:[],staff:[],shifts:[],attendance:[],requests:[],equipment:[],reservations:[],notices:[]};
}

function object(value:any) {
  ok(value && typeof value==='object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value)),422,'office_fields_invalid','行政欄位格式不符');
  ok(Reflect.ownKeys(value).every(k=>typeof k==='string' && !['__proto__','prototype','constructor'].includes(k)),422,'office_fields_invalid','不允許此行政欄位');
}
function keys(value:any,required:string[],optional:string[]=[]) {
  object(value);
  const allowed = new Set([...required,...optional]);
  ok(Reflect.ownKeys(value).every(k=>typeof k==='string' && allowed.has(k) && value[k]!==undefined) && required.every(k=>Object.hasOwn(value,k)),422,'office_fields_invalid','行政欄位缺漏或包含不允許的欄位');
}
function text(value:any,max=100,allowEmpty=false) {
  ok(typeof value==='string' && value.length<=max && (allowEmpty || value.trim().length>0) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),422,'office_text_invalid','行政文字缺漏或超出長度');
}
function enumValue(value:any,allowed:readonly string[]) {
  ok(allowed.includes(value),422,'office_state_invalid','行政種類或狀態不符');
}
function integer(value:any,min=0,max=1e9) {
  ok(Number.isSafeInteger(value) && value>=min && value<=max,422,'office_number_invalid','行政數值須為範圍內整數');
}
function uuid(value:any) {
  ok(typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),422,'office_id_invalid','行政識別格式不符');
}

// Dates are explicit ISO instants; comparing the offset-adjusted components also rejects rolled-over dates.
function instant(value:any,minuteAligned=false):number {
  ok(typeof value==='string',422,'office_time_invalid','請填含時區的 ISO 日期時間');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  ok(match,422,'office_time_invalid','請填含時區的 ISO 日期時間');
  const [,year,month,day,hour,minute,second,fraction,zone,sign,zoneHour,zoneMinute] = match;
  const offsetHour = Number(zoneHour??0), offsetMinute = Number(zoneMinute??0);
  ok(Number(year)>=1 && Number(hour)<=23 && Number(minute)<=59 && Number(second)<=59 && offsetHour<=14 && offsetMinute<=59 && (offsetHour!==14 || offsetMinute===0),422,'office_time_invalid','日期時間不合法');
  const ms = Date.parse(value);
  ok(Number.isFinite(ms),422,'office_time_invalid','日期時間不合法');
  const offset = zone==='Z' ? 0 : (sign==='+'?1:-1)*(offsetHour*60+offsetMinute)*60000;
  const local = new Date(ms+offset).toISOString();
  ok(local.slice(0,19)===`${year}-${month}-${day}T${hour}:${minute}:${second}`,422,'office_time_invalid','日期時間不合法');
  if(minuteAligned)ok(second==='00' && (!fraction || Number(fraction)===0),422,'office_time_invalid','排班、出勤與借用時間須對齊整分鐘');
  return ms;
}
function interval(row:any,withBreak=false,maxMinutes=48*60) {
  const start = instant(row.start_at,true), end = instant(row.end_at,true);
  const maximumLabel=maxMinutes===48*60?'48 小時':'31 天';
  ok(end>start && end-start<=maxMinutes*60000,422,'office_interval_invalid',`結束須晚於開始，單筆時段最多 ${maximumLabel}`);
  if(withBreak){integer(row.break_minutes,0,48*60);ok(row.break_minutes<(end-start)/60000,422,'office_break_invalid','休息分鐘須少於整段時間');}
}
function rowById<T extends {id:string}>(rows:T[],id:any):T {
  uuid(id);
  const row = rows.find(v=>v.id===id);
  ok(row,404,'office_record_missing','找不到行政紀錄');
  return row;
}
function activeUnit(a:Administration,id:any) {
  const unit = rowById(a.units,id);
  ok(unit.active,409,'office_unit_inactive','請選啟用中的單位');
  return unit;
}
function activeStaff(a:Administration,id:any,unitId?:string) {
  const staff = rowById(a.staff,id);
  ok(staff.status==='active',409,'office_staff_inactive','請選啟用中的示範員工');
  activeUnit(a,staff.unit_id);
  if(unitId!==undefined)ok(staff.unit_id===unitId,422,'office_unit_mismatch','示範員工與單位不符');
  return staff;
}
function stamp(now:string):Stamp {return {id:randomUUID(),created_at:now,updated_at:now};}
function provided(p:any,key:string,fallback:any) {return Object.hasOwn(p,key)?p[key]:fallback;}
function uniqueCodes(rows:{code:string}[]) {
  const codes = new Set<string>();
  for(const row of rows){const code = row.code.trim().toLowerCase();ok(!codes.has(code),422,'office_code_duplicate','行政代碼不可重複');codes.add(code);}
}
function overlap(rows:{start_at:string;end_at:string}[]) {
  const sorted = [...rows].sort((x,y)=>Date.parse(x.start_at)-Date.parse(y.start_at));
  for(let i=1;i<sorted.length;i++)ok(Date.parse(sorted[i-1].end_at)<=Date.parse(sorted[i].start_at),409,'office_time_conflict','同一示範員工或設備的時段重疊');
}
function groupedOverlap<T extends {start_at:string;end_at:string}>(rows:T[],key:(r:T)=>string) {
  const groups = new Map<string,T[]>();
  for(const row of rows){const group = groups.get(key(row))??[];group.push(row);groups.set(key(row),group);}
  for(const group of groups.values())overlap(group);
}
function requestFields(a:Administration,row:Administration['requests'][number]) {
  enumValue(row.type,['leave','purchase','expense','general']);
  rowById(a.units,row.unit_id);
  if(row.staff_id!==null){const staff=rowById(a.staff,row.staff_id);ok(staff.unit_id===row.unit_id,422,'office_unit_mismatch','申請的示範員工與單位不符');}
  text(row.title);text(row.description,2000,true);text(row.processing_note,1000,true);
  integer(row.amount_minor);
  ok(row.currency==='SIM',422,'simulation_required','行政申請只接受 SIM 示範金額');
  enumValue(row.status,['draft','submitted','returned','withdrawn','prepared_unreviewed']);
  const lifecycle:Record<RequestStatus,RequestStatus[]>={draft:['submitted','withdrawn'],submitted:['returned','withdrawn','prepared_unreviewed'],returned:['draft','submitted','withdrawn'],withdrawn:[],prepared_unreviewed:[]};
  ok(Array.isArray(row.transitions) && row.transitions.length>=1 && row.transitions.length<=50,422,'office_transition_limit','每份申請須有狀態紀錄，最多 50 筆');
  let previousAt=instant(row.created_at),previousStatus:RequestStatus|undefined,latestReason='';
  for(const entry of row.transitions){
    keys(entry,['status','at','note']);enumValue(entry.status,['draft','submitted','returned','withdrawn','prepared_unreviewed']);text(entry.note,1000,true);
    const at=instant(entry.at);
    ok(at>=previousAt && at<=instant(row.updated_at),422,'office_transition_invalid','申請狀態紀錄時間不符');
    if(previousStatus===undefined)ok(entry.status==='draft' && at===instant(row.created_at),422,'office_transition_invalid','申請狀態紀錄須從建立時的草稿開始');
    else ok(lifecycle[previousStatus].includes(entry.status),422,'office_transition_invalid','申請狀態紀錄流程不符');
    if(entry.status==='returned'){text(entry.note,1000);latestReason=entry.note;}else ok(entry.note==='',422,'office_transition_invalid','只有退回紀錄可包含處理原因');
    previousAt=at;previousStatus=entry.status;
  }
  ok(previousStatus===row.status && row.processing_note===latestReason,422,'office_transition_invalid','申請狀態或最新退回原因與紀錄不符');
  ok((row.start_at===null)===(row.end_at===null),422,'office_interval_invalid','申請起訖時間須同時填寫');
  if(row.start_at!==null)interval(row,false,row.type==='leave'?31*24*60:48*60);
  if(row.type==='leave')ok(row.staff_id!==null && row.start_at!==null && row.amount_minor===0,422,'office_leave_invalid','請假須指定示範員工與起訖時間，金額須為 0');
  if(['purchase','expense'].includes(row.type))integer(row.amount_minor,1);
  if(row.status==='returned')text(row.processing_note,1000);
  if(row.status==='submitted'){activeUnit(a,row.unit_id);if(row.staff_id!==null)activeStaff(a,row.staff_id,row.unit_id);}
}

export function validateAdministration(world:any):void {
  const enabled = Array.isArray(world.modules) && world.modules.includes('administration');
  if(!Object.hasOwn(world,'administration')){ok(!enabled,422,'office_schema_invalid','啟用行政模組須有行政資料');return;}
  ok(enabled,422,'office_schema_invalid','未啟用行政模組不可匯入行政資料');
  const a:Administration = world.administration;
  keys(a,['format',...lists]);
  ok(a.format==='freedom-administration-v1',422,'office_schema_invalid','行政資料版本不符');
  const ids = new Set<string>();
  const legacyIds = (value:any):void=>{
    if(value===null || typeof value!=='object')return;
    if(Array.isArray(value)){for(const child of value)legacyIds(child);return;}
    if(typeof value.id==='string')ids.add(value.id.toLowerCase());
    for(const child of Object.values(value))legacyIds(child);
  };
  for(const [key,value] of Object.entries(world))if(key!=='administration')legacyIds(value);
  for(const name of lists){
    ok(Array.isArray(a[name]) && a[name].length<=limits[name],422,'office_record_limit','行政紀錄超出上限');
    for(const row of a[name]){
      keys(row,[...stampKeys,...rowKeys[name]]);uuid(row.id);
      const id=row.id.toLowerCase();ok(!ids.has(id),422,'id_collision','行政紀錄識別重複');ids.add(id);
      ok(instant(row.updated_at)>=instant(row.created_at),422,'office_time_invalid','更新時間不可早於建立時間');
    }
  }
  for(const row of a.units){
    text(row.name);enumValue(row.kind,['branch','department']);
    ok(typeof row.active==='boolean',422,'office_fields_invalid','單位啟用狀態不符');
    if(row.parent_id!==null){const parent=rowById(a.units,row.parent_id);ok(parent.id!==row.id,422,'office_unit_cycle','單位不可從屬自身');if(row.active)ok(parent.active,422,'office_unit_inactive','啟用的子單位須有啟用的上層單位');}
    const visited = new Set<string>([row.id]);let parentId=row.parent_id;
    while(parentId!==null){ok(!visited.has(parentId),422,'office_unit_cycle','單位層級不可循環');visited.add(parentId);parentId=rowById(a.units,parentId).parent_id;}
  }
  for(const row of a.staff){text(row.code,32);text(row.alias,80);text(row.role_label,100,true);enumValue(row.status,['active','inactive']);rowById(a.units,row.unit_id);if(row.status==='active')activeUnit(a,row.unit_id);}
  uniqueCodes(a.staff);
  for(const name of ['shifts','attendance'] as const)for(const row of a[name]){
    const staff=rowById(a.staff,row.staff_id);rowById(a.units,row.unit_id);
    ok(staff.unit_id===row.unit_id,422,'office_unit_mismatch','排班或出勤的示範員工與單位不符');interval(row,true);text(row.note,1000,true);
    if(name==='shifts'){const shift=row as Administration['shifts'][number];enumValue(shift.status,['scheduled','completed','cancelled']);if(shift.status==='scheduled'){activeUnit(a,row.unit_id);activeStaff(a,row.staff_id,row.unit_id);}}
  }
  groupedOverlap(a.shifts.filter(row=>row.status!=='cancelled'),row=>row.staff_id);
  groupedOverlap(a.attendance,row=>row.staff_id);
  for(const row of a.requests)requestFields(a,row);
  for(const row of a.equipment){text(row.code,32);text(row.name);enumValue(row.state,['available','maintenance','retired']);rowById(a.units,row.unit_id);if(row.state!=='retired')activeUnit(a,row.unit_id);}
  uniqueCodes(a.equipment);
  for(const row of a.reservations){
    const equipment=rowById(a.equipment,row.equipment_id);rowById(a.staff,row.staff_id);interval(row,false,31*24*60);text(row.purpose,1000,true);enumValue(row.status,['reserved','returned','cancelled']);
    if(row.status==='reserved'){ok(equipment.state==='available',409,'office_equipment_unavailable','設備目前不可借用');activeUnit(a,equipment.unit_id);activeStaff(a,row.staff_id);}
  }
  groupedOverlap(a.reservations.filter(row=>row.status==='reserved'),row=>row.equipment_id);
  for(const row of a.notices){text(row.title);text(row.body,2000,true);if(row.unit_id!==null)rowById(a.units,row.unit_id);ok(typeof row.pinned==='boolean',422,'office_fields_invalid','公告置頂狀態不符');if(row.due_at!==null)instant(row.due_at);}
}

function monday(value:any):number {
  ok(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value),422,'office_week_invalid','週日期須使用 YYYY-MM-DD');
  const ms=instant(`${value}T00:00:00+08:00`);
  ok(new Date(ms+8*60*60000).getUTCDay()===1,422,'office_week_invalid','複製排班的起始日期須為週一');
  return ms;
}
function editablePayload(p:any) {ok(Object.keys(p).length>1,422,'office_fields_invalid','請指定要更新的欄位');}
function requestActiveReferences(a:Administration,row:Administration['requests'][number]) {activeUnit(a,row.unit_id);if(row.staff_id!==null)activeStaff(a,row.staff_id,row.unit_id);}
function transitionRequest(row:Administration['requests'][number],status:RequestStatus,now:string,note='') {
  row.status=status;row.transitions.push({status,at:now,note});
  if(status==='returned')row.processing_note=note;
}

export function applyAdministration(world:any,action:string,p:any,now:string):string {
  ok(Object.hasOwn(actions,action),422,'action_invalid','無效行政操作');
  const shape=actions[action];keys(p,shape.required,shape.optional);instant(now);
  if(action==='office.enable'){
    ok(Array.isArray(world.modules),422,'office_schema_invalid','工作區模組不符');
    ok(!world.modules.includes('administration') && !Object.hasOwn(world,'administration'),409,'office_already_enabled','行政模組已啟用');
    world.administration=createAdministration();world.modules.push('administration');
    return world.generation_id;
  }
  ok(Array.isArray(world.modules) && world.modules.includes('administration'),403,'module_disabled','行政模組未啟用');
  validateAdministration(world);
  const a:Administration=world.administration;
  let result:string;
  if(action==='office.unit.create'){
    const parent_id=p.parent_id??null;if(parent_id!==null)activeUnit(a,parent_id);
    const row={...stamp(now),name:p.name,kind:p.kind,parent_id,active:true};a.units.push(row);result=row.id;
  }else if(action==='office.unit.update'){
    editablePayload(p);const row=rowById(a.units,p.id);if('name' in p)row.name=p.name;if('active' in p)row.active=p.active;row.updated_at=now;result=row.id;
  }else if(action==='office.staff.create'){
    activeUnit(a,p.unit_id);const row={...stamp(now),code:p.code,alias:p.alias,unit_id:p.unit_id,role_label:provided(p,'role_label',''),status:'active' as const};a.staff.push(row);result=row.id;
  }else if(action==='office.staff.update'){
    editablePayload(p);const row=rowById(a.staff,p.id);for(const key of ['alias','role_label','status'] as const)if(key in p)row[key]=p[key];
    row.updated_at=now;result=row.id;
  }else if(action==='office.shift.create' || action==='office.attendance.create'){
    activeUnit(a,p.unit_id);activeStaff(a,p.staff_id,p.unit_id);
    const row={...stamp(now),staff_id:p.staff_id,unit_id:p.unit_id,start_at:p.start_at,end_at:p.end_at,break_minutes:provided(p,'break_minutes',0),note:provided(p,'note','')};
    if(action==='office.shift.create')a.shifts.push({...row,status:'scheduled'});else a.attendance.push(row);result=row.id;
  }else if(action==='office.shift.cancel' || action==='office.shift.complete'){
    const row=rowById(a.shifts,p.id);ok(row.status==='scheduled',409,'office_transition_invalid','只有已排定班次可取消或標記排班完成');
    row.status=action.endsWith('.cancel')?'cancelled':'completed';row.updated_at=now;result=row.id;
  }else if(action==='office.shift.copy_week'){
    const from=monday(p.from_date),to=monday(p.to_date);
    ok(from!==to,422,'office_week_invalid','來源週與目標週不可相同');
    const source=a.shifts.filter(row=>row.status!=='cancelled' && Date.parse(row.start_at)>=from && Date.parse(row.start_at)<from+7*24*60*60000);
    ok(source.length>0,422,'office_week_empty','來源週沒有可複製的班次');
    const additions=source.map(row=>({...row,...stamp(now),start_at:new Date(Date.parse(row.start_at)+to-from).toISOString(),end_at:new Date(Date.parse(row.end_at)+to-from).toISOString(),status:'scheduled' as const}));
    const trial={...world,administration:{...a,shifts:[...a.shifts,...additions]}};
    validateAdministration(trial);a.shifts.push(...additions);result=additions[0].id;
  }else if(action==='office.request.create'){
    activeUnit(a,p.unit_id);if(p.staff_id!==null && p.staff_id!==undefined)activeStaff(a,p.staff_id,p.unit_id);
    const row={...stamp(now),type:p.type,staff_id:p.staff_id??null,unit_id:p.unit_id,title:p.title,description:provided(p,'description',''),amount_minor:provided(p,'amount_minor',0),currency:'SIM' as const,start_at:p.start_at??null,end_at:p.end_at??null,status:'draft' as const,processing_note:'',transitions:[{status:'draft' as const,at:now,note:''}]};
    a.requests.push(row);result=row.id;
  }else if(action.startsWith('office.request.')){
    const row=rowById(a.requests,p.id);
    if(action==='office.request.update'){
      editablePayload(p);ok(['draft','returned'].includes(row.status),409,'office_transition_invalid','只有草稿或退回的申請可編輯');
      for(const key of ['title','description','amount_minor','start_at','end_at'] as const)if(key in p)(row as any)[key]=p[key];
      if(row.status==='returned')transitionRequest(row,'draft',now);
    }else if(action==='office.request.submit'){
      ok(['draft','returned'].includes(row.status),409,'office_transition_invalid','只有草稿或退回的申請可送出');requestActiveReferences(a,row);transitionRequest(row,'submitted',now);
    }else if(action==='office.request.return'){
      ok(row.status==='submitted',409,'office_transition_invalid','只有已送出的申請可退回');text(p.processing_note,1000);transitionRequest(row,'returned',now,p.processing_note);
    }else if(action==='office.request.withdraw'){
      ok(['draft','submitted','returned'].includes(row.status),409,'office_transition_invalid','這份申請目前不可撤回');transitionRequest(row,'withdrawn',now);
    }else if(action==='office.request.prepare'){
      ok(row.status==='submitted',409,'office_transition_invalid','只有已送出的申請可整理成待覆核資料');transitionRequest(row,'prepared_unreviewed',now);
    }
    row.updated_at=now;result=row.id;
  }else if(action==='office.equipment.create'){
    activeUnit(a,p.unit_id);const row={...stamp(now),code:p.code,name:p.name,unit_id:p.unit_id,state:'available' as const};a.equipment.push(row);result=row.id;
  }else if(action==='office.equipment.update'){
    editablePayload(p);const row=rowById(a.equipment,p.id);if('name' in p)row.name=p.name;if('state' in p)row.state=p.state;row.updated_at=now;result=row.id;
  }else if(action==='office.reservation.create'){
    const equipment=rowById(a.equipment,p.equipment_id);ok(equipment.state==='available',409,'office_equipment_unavailable','設備目前不可借用');activeUnit(a,equipment.unit_id);activeStaff(a,p.staff_id);
    const row={...stamp(now),equipment_id:p.equipment_id,staff_id:p.staff_id,start_at:p.start_at,end_at:p.end_at,purpose:provided(p,'purpose',''),status:'reserved' as const};a.reservations.push(row);result=row.id;
  }else if(action==='office.reservation.return' || action==='office.reservation.cancel'){
    const row=rowById(a.reservations,p.id);ok(row.status==='reserved',409,'office_transition_invalid','只有借用中的預約可歸還或取消');row.status=action.endsWith('.return')?'returned':'cancelled';row.updated_at=now;result=row.id;
  }else if(action==='office.notice.create'){
    const unit_id=p.unit_id??null;if(unit_id!==null)activeUnit(a,unit_id);
    const row={...stamp(now),title:p.title,body:provided(p,'body',''),unit_id,pinned:provided(p,'pinned',false),due_at:p.due_at??null};a.notices.push(row);result=row.id;
  }else{
    editablePayload(p);const row=rowById(a.notices,p.id);if('unit_id' in p && p.unit_id!==null)activeUnit(a,p.unit_id);
    for(const key of ['title','body','unit_id','pinned','due_at'] as const)if(key in p)(row as any)[key]=p[key];row.updated_at=now;result=row.id;
  }
  validateAdministration(world);
  return result;
}
