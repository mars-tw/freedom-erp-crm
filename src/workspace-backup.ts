import {createHash} from 'node:crypto';
import {ok,Problem} from './problem.js';

export const backupChunkBytes=24000,backupMaxBytes=3*1024*1024;
const stageKey='backup-import-stage',ttl=15*60*1000;
const cancelKey='backup-cancelled-begins';
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('');
type Stage={id:string;bytes:number;sha256:string;parts:number;expected_version:number;expires:number;received:Record<string,{bytes:number;sha256:string}>;keys:Record<string,string>};
export type BackupStageSummary={id:string;bytes:number;sha256:string;parts:number;chunk_bytes:number;expected_version:number;expires_at:string;received:number[]};
export const backupHash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const chunkKey=(id:string,index:number)=>'backup-part:'+id+':'+index;
function fields(value:any,allowed:string[]){ok(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===allowed.length&&allowed.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>allowed.includes(k)),422,'import_stage_invalid','備份傳輸欄位不符');}
function id(value:any){ok(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),422,'import_stage_invalid','備份工作識別不符');}
function summary(stage:Stage):BackupStageSummary{return {id:stage.id,bytes:stage.bytes,sha256:stage.sha256,parts:stage.parts,chunk_bytes:backupChunkBytes,expected_version:stage.expected_version,expires_at:new Date(stage.expires).toISOString(),received:Object.keys(stage.received).map(Number).sort((a,b)=>a-b)};}
async function erase(storage:DurableObjectStorage,stage:Stage){await storage.transaction(async txn=>{for(let i=0;i<stage.parts;i++)await txn.delete(chunkKey(stage.id,i));await txn.delete(stageKey);});}
async function readStage(storage:DurableObjectStorage,now:number):Promise<Stage|undefined>{const stage=await storage.get<Stage>(stageKey);if(stage&&stage.expires<=now){await erase(storage,stage);return undefined;}return stage;}
function remember(stage:Stage,key:string,hash:string){const previous=stage.keys[key];if(previous){ok(previous===hash,409,'idempotency_conflict','相同備份操作識別不能使用不同內容');return;}ok(Object.keys(stage.keys).length<200,429,'import_stage_limit','備份重試次數已達上限，請取消後重新開始');stage.keys[key]=hash;}

export async function backupStatus(storage:DurableObjectStorage,now:number){const stage=await readStage(storage,now);return {stage:stage?summary(stage):null};}

export async function backupTransfer(storage:DurableObjectStorage,path:string,body:any,expected:number,current:number,key:string,hash:string,now:number):Promise<{stage?:BackupStageSummary;aborted?:boolean}> {
 ok(expected===current,412,'version_stale','工作區已更新，備份尚未覆寫資料');
 let stage=await readStage(storage,now);
 if(path==='/import/begin'){
  const cancellations=await storage.get<Record<string,number>>(cancelKey)??{};ok(!(cancellations[key]>now),409,'import_cancelled','這次備份傳輸已取消，請重新選擇檔案開始');
  fields(body,['bytes','sha256','parts']);ok(Number.isInteger(body.bytes)&&body.bytes>0&&body.bytes<=backupMaxBytes&&Number.isInteger(body.parts)&&body.parts===Math.ceil(body.bytes/backupChunkBytes)&&typeof body.sha256==='string'&&/^[a-f0-9]{64}$/.test(body.sha256),422,'import_stage_invalid','備份大小、分段數或摘要不符');
  if(stage){ok(stage.expected_version===current,412,'version_stale','工作區已更新，請取消舊備份傳輸');ok(stage.bytes===body.bytes&&stage.sha256===body.sha256&&stage.parts===body.parts,409,'import_in_progress','另一份備份尚在傳輸，請先取消原工作');remember(stage,key,hash);await storage.put(stageKey,stage);return {stage:summary(stage)};}
  stage={id:token(),bytes:body.bytes,sha256:body.sha256,parts:body.parts,expected_version:current,expires:now+ttl,received:{},keys:{[key]:hash}};await storage.put(stageKey,stage);return {stage:summary(stage)};
 }
 if(path==='/import/abort'){
  if(body&&Object.hasOwn(body,'begin_key')){fields(body,['begin_key']);ok(typeof body.begin_key==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(body.begin_key),422,'import_stage_invalid','備份開始識別不符');const cancellations=Object.fromEntries(Object.entries(await storage.get<Record<string,number>>(cancelKey)??{}).filter(([,expiry])=>expiry>now));ok(Object.keys(cancellations).length<64||Object.hasOwn(cancellations,body.begin_key),429,'import_stage_limit','取消操作較密集，請稍候接續');cancellations[body.begin_key]=now+ttl;await storage.put(cancelKey,cancellations);if(stage&&Object.hasOwn(stage.keys,body.begin_key))await erase(storage,stage);return {aborted:true};}
  fields(body,['id']);id(body.id);if(stage){ok(stage.id===body.id,404,'import_stage_missing','找不到這份備份傳輸');await erase(storage,stage);}return {aborted:true};
 }
 ok(path==='/import/part',404,'not_found','找不到備份路徑');fields(body,['id','index','chunk']);id(body.id);
 ok(stage&&stage.id===body.id,404,'import_stage_missing','備份傳輸已過期或不存在，原工作區未更動');ok(stage.expected_version===current,412,'version_stale','工作區已更新，備份尚未覆寫資料');
 ok(Number.isInteger(body.index)&&body.index>=0&&body.index<stage.parts&&typeof body.chunk==='string'&&body.chunk.length<=32000&&/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.chunk),422,'import_part_invalid','備份片段格式不符');
 let data:Uint8Array;try{const decoded=atob(body.chunk);ok(btoa(decoded)===body.chunk,422,'import_part_invalid','備份片段編碼不符');data=Uint8Array.from(decoded,ch=>ch.charCodeAt(0));}catch(error){if(error instanceof Problem)throw error;throw new Problem(422,'import_part_invalid','備份片段編碼不符');}
 const wanted=Math.min(backupChunkBytes,stage.bytes-body.index*backupChunkBytes);ok(data.length===wanted,422,'import_part_invalid','備份片段長度不符');const partHash=backupHash(data);
 remember(stage,key,hash);const previous=stage.received[String(body.index)];if(previous){ok(previous.sha256===partHash&&previous.bytes===data.length,409,'import_part_conflict','同一備份片段不能換成其他內容');await storage.put(stageKey,stage);return {stage:summary(stage)};}
 stage.received[String(body.index)]={bytes:data.length,sha256:partHash};await storage.transaction(async txn=>{await txn.put(chunkKey(stage!.id,body.index),data);await txn.put(stageKey,stage);});return {stage:summary(stage)};
}

export async function assembleBackup(storage:DurableObjectStorage,body:any,current:number,now:number):Promise<any>{
 fields(body,['id']);id(body.id);const stage=await readStage(storage,now);ok(stage&&stage.id===body.id,404,'import_stage_missing','備份傳輸已過期或不存在，原工作區未更動');ok(stage.expected_version===current,412,'version_stale','工作區已更新，備份尚未覆寫資料');ok(Object.keys(stage.received).length===stage.parts,409,'import_incomplete','備份尚未完整傳輸，原工作區未更動');
 const bytes=new Uint8Array(stage.bytes);for(let i=0;i<stage.parts;i++){const part=await storage.get<Uint8Array>(chunkKey(stage.id,i));ok(part instanceof Uint8Array&&part.length===stage.received[String(i)]?.bytes&&backupHash(part)===stage.received[String(i)]?.sha256,422,'import_integrity','備份片段內容不符，原工作區未更動');bytes.set(part,i*backupChunkBytes);}
 ok(backupHash(bytes)===stage.sha256,422,'import_integrity','備份摘要不符，原工作區未更動');try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Problem(422,'import_invalid','備份不是有效的 UTF-8 JSON，原工作區未更動');}
}
export async function discardBackup(storage:DurableObjectStorage,idValue?:string){const stage=await storage.get<Stage>(stageKey);if(stage&&(!idValue||stage.id===idValue))await erase(storage,stage);}
