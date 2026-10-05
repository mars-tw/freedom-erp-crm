import type {Workspace} from './api';

export type OfficeTab = 'units'|'staff'|'shifts'|'attendance'|'requests'|'equipment'|'reservations'|'notices';
export interface OfficeRow {id:string;created_at:string;updated_at:string}
export interface OfficeUnit extends OfficeRow {name:string;kind:'branch'|'department';parent_id:string|null;active:boolean}
export interface OfficeStaff extends OfficeRow {code:string;alias:string;unit_id:string;role_label:string;status:'active'|'inactive'}
export interface OfficeTime extends OfficeRow {staff_id:string;unit_id:string;start_at:string;end_at:string;break_minutes:number;note:string;status?:'scheduled'|'completed'|'cancelled';voided?:boolean}
export type OfficeRequestStatus='draft'|'submitted'|'returned'|'withdrawn'|'prepared_unreviewed';
export interface OfficeRequest extends OfficeRow {type:'leave'|'purchase'|'expense'|'general';staff_id:string|null;unit_id:string;title:string;description:string;amount_minor:number;currency:string;start_at:string|null;end_at:string|null;status:OfficeRequestStatus;processing_note:string;transitions:{status:OfficeRequestStatus;at:string;note:string}[]}
export interface OfficeEquipment extends OfficeRow {code:string;name:string;unit_id:string;state:'available'|'maintenance'|'retired'}
export interface OfficeReservation extends OfficeRow {equipment_id:string;staff_id:string;start_at:string;end_at:string;purpose:string;status:'reserved'|'returned'|'cancelled'}
export interface OfficeNotice extends OfficeRow {title:string;body:string;unit_id:string|null;pinned:boolean;due_at:string|null;archived?:boolean}
export interface OfficeChange {id:string;kind:'shift.update'|'attendance.update'|'attendance.void'|'reservation.update'|'notice.archive'|'notice.restore';record_id:string;at:string;reason:string;before:Record<string,any>;after:Record<string,any>}
export interface OfficeData {format:'freedom-administration-v1';units:OfficeUnit[];staff:OfficeStaff[];shifts:OfficeTime[];attendance:OfficeTime[];requests:OfficeRequest[];equipment:OfficeEquipment[];reservations:OfficeReservation[];notices:OfficeNotice[];changes:OfficeChange[]}

export const officeTabs:{id:OfficeTab;label:string}[]=[{id:'units',label:'組織'},{id:'staff',label:'假員工'},{id:'shifts',label:'週班表'},{id:'attendance',label:'手動出勤'},{id:'requests',label:'申請'},{id:'equipment',label:'設備'},{id:'reservations',label:'借用'},{id:'notices',label:'公告'}];
export const officeStatus:Record<string,string>={active:'使用中',inactive:'停用',scheduled:'已排班',completed:'已結束',cancelled:'已取消',draft:'草稿',submitted:'待整理',returned:'退回補件',withdrawn:'已撤回',prepared_unreviewed:'整理完成（未覆核）',available:'可借用',maintenance:'維修中',retired:'已停用',reserved:'已預約',reservation_returned:'已歸還',recorded:'有效紀錄',voided:'已作廢',archived:'已封存'};
export const requestNames:Record<OfficeRequest['type'],string>={leave:'請假',purchase:'請購',expense:'費用',general:'一般申請'};

export function officeData(workspace:Workspace):OfficeData {
 const source:Partial<OfficeData>=workspace.administration||{};
 return {format:'freedom-administration-v1',changes:Array.isArray(source.changes)?source.changes:[],...Object.fromEntries(officeTabs.map(({id})=>[id,Array.isArray(source[id])?source[id]:[]]))} as unknown as OfficeData;
}
export function taipeiDate(value:Date|string=new Date()):string {
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 return new Date(date.getTime()+8*60*60*1000).toISOString().slice(0,10);
}
export function localInput(value:string|null|undefined):string {
 if(!value)return '';
 const date=new Date(value);return Number.isFinite(date.getTime())?new Date(date.getTime()+8*60*60*1000).toISOString().slice(0,16):'';
}
export function inputToISO(value:string):string {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))throw new Error('請填寫完整的臺北日期與時間。');
 const date=new Date(`${value}:00+08:00`);
 if(!Number.isFinite(date.getTime())||localInput(date.toISOString())!==value)throw new Error('日期或時間無效，請重新選擇。');
 return date.toISOString();
}
export function addDays(date:string,days:number):string {return new Date(new Date(`${date}T00:00:00Z`).getTime()+days*86400000).toISOString().slice(0,10)}
export function monday(date:string=taipeiDate()):string {const day=new Date(`${date}T00:00:00Z`).getUTCDay();return addDays(date,-((day+6)%7))}
export function validMonday(date:string):boolean {return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(new Date(`${date}T00:00:00Z`).getTime())&&new Date(`${date}T00:00:00Z`).toISOString().slice(0,10)===date&&new Date(`${date}T00:00:00Z`).getUTCDay()===1}
export function weekDates(start:string):string[] {return Array.from({length:7},(_,index)=>addDays(start,index))}
export function formatTime(value:string):string {return localInput(value).slice(11,16)}
export function formatDateTime(value:string|null):string {return value?localInput(value).replace('T',' '):'未設定'}
export function netMinutes(row:Pick<OfficeTime,'start_at'|'end_at'|'break_minutes'>):number {return Math.max(0,Math.round((Date.parse(row.end_at)-Date.parse(row.start_at))/60000)-row.break_minutes)}
export function simMinor(value:string):number {
 if(!/^\d+(\.\d{1,2})?$/.test(value))throw new Error('測試幣金額最多填兩位小數。');
 const [whole,fraction='']=value.split('.');const minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(minor))throw new Error('測試幣金額超出範圍。');return minor;
}
export function formatSIM(minor:number):string {return `${(minor/100).toLocaleString('zh-TW',{minimumFractionDigits:2,maximumFractionDigits:2})} SIM`}
export function attendanceDifferences(data:OfficeData,start:string,unit=''):{person:OfficeStaff;scheduled:number;recorded:number;difference:number}[] {
 const end=addDays(start,7),rows=(items:OfficeTime[])=>items.filter(row=>row.status!=='cancelled'&&!row.voided&&taipeiDate(row.start_at)>=start&&taipeiDate(row.start_at)<end);
 const shifts=rows(data.shifts),attendance=rows(data.attendance);
 return data.staff.filter(person=>(!unit||person.unit_id===unit)&&(shifts.some(row=>row.staff_id===person.id)||attendance.some(row=>row.staff_id===person.id))).map(person=>{const scheduled=shifts.filter(row=>row.staff_id===person.id).reduce((total,row)=>total+netMinutes(row),0);const recorded=attendance.filter(row=>row.staff_id===person.id).reduce((total,row)=>total+netMinutes(row),0);return {person,scheduled,recorded,difference:recorded-scheduled}});
}

/** A CSV download is a read-only view. Neutralize spreadsheet formula prefixes before quoting every cell. */
export function officeCSV(rows:readonly (readonly unknown[])[]):string {
 const cell=(raw:unknown)=>{let value=raw==null?'':String(raw);if(/^[\s\u0000-\u001f]*[=+\-@]/.test(value)||/^[\t\r]/.test(value))value=`'${value}`;return `"${value.replaceAll('"','""')}"`};
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function officeFilename(tab:OfficeTab,date=taipeiDate()):string {return `freedom-administration-${tab}-${date}.csv`}
