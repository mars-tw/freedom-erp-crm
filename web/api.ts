export type RecordData = Record<string, any>;
export interface Workspace extends RecordData {version:number;company_name:string;industry:string;modules:string[];generation_id:string;products:RecordData[];wallets:RecordData[];orders:RecordData[];services:RecordData[];ledger:RecordData[];customers:RecordData[];contacts:RecordData[];deals:RecordData[];cases:RecordData[];quotes:RecordData[];tasks:RecordData[];milestones:RecordData[];boms:RecordData[];workOrders:RecordData[]}
export interface Template {id:string;name:string;modules:string[];purpose:string;version:number;sample:RecordData;module_dependencies:Record<string,string[]>}
export interface View {workspace:Workspace|null;csrf:string;version:number;report:RecordData|null;expires_at?:string|null;retention_hours?:number|null}
export interface TemplateCatalog {items:Template[];defaults:{industry:string;company_name:string;modules?:string[];public_demo:boolean;retention_hours:number|null}}
export interface Pending {key:string;path:string;body:string;version:number}
export class ApiError extends Error {constructor(message:string,public status:number,public code:string){super(message)}}
const pendingKey='freedom-erp.pending.v1';
export function readPending():Pending|null{try{return JSON.parse(sessionStorage.getItem(pendingKey)||'null')}catch{return null}}
export function forgetPending(){sessionStorage.removeItem(pendingKey)}
async function decode(response:Response):Promise<any>{const data:any=await response.json().catch(()=>{throw new Error('伺服器回應無法讀取，原操作已保留。請確認原操作結果。')});if(!response.ok)throw new ApiError(data.message||data.error?.message||'操作未完成，請重新整理後再試。',response.status,data.code||data.error?.code||'request_failed');return data}
export async function getView():Promise<View>{return decode(await fetch('/api/workspace/view',{credentials:'same-origin'}))}
export async function getTemplates():Promise<TemplateCatalog>{return decode(await fetch('/api/templates'))}
export async function mutate(path:string,data:RecordData,view:View,pending?:Pending){
 const request=pending||{key:crypto.randomUUID(),path,body:JSON.stringify(data),version:view.version};
 sessionStorage.setItem(pendingKey,JSON.stringify(request));
 try {const result=await decode(await fetch(request.path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':view.csrf,'Idempotency-Key':request.key,'If-Match-Version':String(request.version)},body:request.body}));forgetPending();return result}
 catch(error){if(error instanceof ApiError && error.status<500)forgetPending();throw error}
}
