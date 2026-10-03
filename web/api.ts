export type RecordData = Record<string, any>;
export interface Workspace extends RecordData {version:number;company_name:string;industry:string;modules:string[];generation_id:string;products:RecordData[];wallets:RecordData[];orders:RecordData[];services:RecordData[];ledger:RecordData[];customers:RecordData[];contacts:RecordData[];deals:RecordData[];cases:RecordData[];quotes:RecordData[];tasks:RecordData[];milestones:RecordData[];boms:RecordData[];workOrders:RecordData[]}
export interface Template {id:string;name:string;modules:string[];purpose:string;version:number;sample:RecordData;module_dependencies:Record<string,string[]>}
export interface View {workspace:Workspace|null;csrf:string;version:number;report:RecordData|null;expires_at?:string|null;retention_hours?:number|null}
export interface TemplateCatalog {items:Template[];defaults:{industry:string;company_name:string;modules?:string[];public_demo:boolean;retention_hours:number|null}}
export interface Pending {key:string;path:string;body:string;version:number}
export class ApiError extends Error {constructor(message:string,public status:number,public code:string){super(message)}}
const pendingKey='freedom-erp.pending.v1';
const paths=new Set(['/api/workspace/commands','/api/workspace/setup','/api/workspace/import','/api/workspace/clear']);
let memoryPending:Pending|null=null;
let preferMemory=false;
function validPending(value:unknown):value is Pending {
 try{const p=value as Pending;if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(key=>!['key','path','body','version'].includes(key))||typeof p.key!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(p.key)||!paths.has(p.path)||!Number.isSafeInteger(p.version)||p.version<0||typeof p.body!=='string'||new TextEncoder().encode(p.body).length>32768)return false;
  const body=JSON.parse(p.body);return !!body&&typeof body==='object'&&!Array.isArray(body);
 }catch{return false;}
}
export function readPending():Pending|null{
 if(preferMemory)return memoryPending;
 try{const raw=sessionStorage.getItem(pendingKey);if(raw){const value=JSON.parse(raw);if(validPending(value))memoryPending=value;}}
 catch{if(memoryPending)preferMemory=true;}
 return memoryPending;
}
export function isPendingVolatile(){return !!memoryPending&&preferMemory;}
function savePending(request:Pending){memoryPending=structuredClone(request);try{sessionStorage.setItem(pendingKey,JSON.stringify(request));preferMemory=false;}catch{preferMemory=true;}}
export function forgetPending(){memoryPending=null;try{sessionStorage.removeItem(pendingKey);preferMemory=false;}catch{preferMemory=true;}}
async function decode(response:Response):Promise<any>{const data:any=await response.json().catch(()=>{throw new Error('伺服器回應無法讀取，原操作已保留。請確認原操作結果。')});if(!response.ok)throw new ApiError(data.message||data.error?.message||'操作未完成，請重新整理後再試。',response.status,data.code||data.error?.code||'request_failed');return data}
export async function getView():Promise<View>{return decode(await fetch('/api/workspace/view',{credentials:'same-origin'}))}
export async function getTemplates():Promise<TemplateCatalog>{return decode(await fetch('/api/templates'))}
export async function mutate(path:string,data:RecordData,view:View,pending?:Pending){
 const request=pending||{key:crypto.randomUUID(),path,body:JSON.stringify(data),version:view.version};
 if(!validPending(request))throw new ApiError('操作暫存格式或大小不符，請核對工作區資料。',422,'pending_invalid');
 savePending(request);
 try {const result=await decode(await fetch(request.path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':view.csrf,'Idempotency-Key':request.key,'If-Match-Version':String(request.version)},body:request.body}));forgetPending();return result}
 catch(error){if(error instanceof ApiError && error.status<500)forgetPending();throw error}
}
