import {ApiError,getView,mutate,type View,type RecordData} from './api';

export type BackupProgress={phase:'checking'|'uploading'|'waiting'|'committing';completed:number;total:number};
type Stage={id:string;bytes:number;sha256:string;parts:number;chunk_bytes:number;expected_version:number;expires_at:string;received:number[]};
const chunkBytes=24000,maxBytes=3*1024*1024;
const cancelled=()=>new DOMException('備份傳輸已取消，原工作區未更動。','AbortError');
function active(signal?:AbortSignal){if(signal?.aborted)throw cancelled();}
function pause(ms:number,signal?:AbortSignal){return new Promise<void>((resolve,reject)=>{active(signal);const stop=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);reject(cancelled());};const timer=setTimeout(()=>{signal?.removeEventListener('abort',stop);resolve();},ms);signal?.addEventListener('abort',stop,{once:true});});}
async function decode(response:Response):Promise<any>{const data:any=await response.json();if(!response.ok)throw new ApiError(data.error?.message||'備份操作未完成',response.status,data.error?.code||'backup_error',Number(data.error?.retry_after_ms)||0);return data;}
export async function getBackupStatus():Promise<{stage:Stage|null;version:number}>{return decode(await fetch('/api/workspace/import/status',{credentials:'same-origin'}));}
async function transfer(path:string,body:RecordData,view:View,signal?:AbortSignal,key=crypto.randomUUID(),progress?:(p:BackupProgress)=>void):Promise<any>{
 const text=JSON.stringify(body);let failures=0;
 while(true){active(signal);try{return await decode(await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-csrf-token':view.csrf,'Idempotency-Key':key,'If-Match-Version':String(view.version)},body:text,signal}));}
  catch(error){if(signal?.aborted)throw cancelled();if(error instanceof ApiError&&error.status===429&&error.code==='rate_limit'){progress?.({phase:'waiting',completed:0,total:0});await pause(Math.min(61000,Math.max(1000,error.retryAfterMs||5000)),signal);continue;}if(error instanceof ApiError&&error.status<500)throw error;if(++failures>3)throw error;await pause(failures*1000,signal);}
 }
}
export async function cancelBackup(id:string,view:View){return transfer('/api/workspace/import/abort',{id},view);}
function base64(bytes:Uint8Array){let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary);}
export function backupText(workspace:RecordData):string{return JSON.stringify(workspace);}

export async function restoreWorkspace(workspace:RecordData,view:View,onProgress:(value:BackupProgress)=>void,signal?:AbortSignal){
 active(signal);const text=backupText(workspace),bytes=new TextEncoder().encode(text);if(!bytes.length||bytes.length>maxBytes)throw new ApiError('這份資料超過 3 MiB 備份傳輸上限，原工作區未更動。',413,'backup_size_limit');
 onProgress({phase:'checking',completed:0,total:Math.ceil(bytes.length/chunkBytes)});
 if(bytes.length<=32000){active(signal);onProgress({phase:'committing',completed:1,total:1});return mutate('/api/workspace/import',{workspace},view);}
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');
 const parts=Math.ceil(bytes.length/chunkBytes),beginKey=crypto.randomUUID();let stage:Stage|null=null,beginStarted=false,commitStarted=false;
 try{
  const status=await getBackupStatus();stage=status.stage;
  if(status.version!==view.version)throw new ApiError('工作區已更新，請先重新讀取，再確認這份備份。',412,'version_stale');
  if(stage){if(stage.expected_version!==view.version)throw new ApiError('工作區已在備份傳輸後更新，請取消舊傳輸並重新確認要還原的資料。',412,'version_stale');if(stage.sha256!==hash||stage.bytes!==bytes.length||stage.parts!==parts)throw new ApiError('另一份備份尚在傳輸，請取消原工作後再選擇這份檔案。',409,'import_in_progress');}
  else{active(signal);beginStarted=true;stage=(await transfer('/api/workspace/import/begin',{bytes:bytes.length,sha256:hash,parts},view,signal,beginKey)).stage;}
  if(!stage||stage.chunk_bytes!==chunkBytes)throw new Error('備份傳輸格式不符，原工作區未更動。');
  const received=new Set(stage.received);let completed=received.size;
  for(let index=0;index<parts;index++){active(signal);if(received.has(index))continue;onProgress({phase:'uploading',completed,total:parts});await transfer('/api/workspace/import/part',{id:stage.id,index,chunk:base64(bytes.slice(index*chunkBytes,(index+1)*chunkBytes))},view,signal,crypto.randomUUID(),onProgress);completed++;onProgress({phase:'uploading',completed,total:parts});await pause(600,signal);}
  active(signal);commitStarted=true;onProgress({phase:'committing',completed:parts,total:parts});return await mutate('/api/workspace/import/commit',{id:stage.id},view);
 }catch(error){if(signal?.aborted&&!commitStarted){try{const current=await getView();if(beginStarted)await transfer('/api/workspace/import/abort',{begin_key:beginKey},current);if(stage&&stage.sha256===hash&&stage.bytes===bytes.length&&stage.expected_version===view.version)await cancelBackup(stage.id,current);}catch{throw new ApiError('取消結果尚未確認，原資料沒有被本次傳輸取代。請在設定頁確認或取消未完成的傳輸。',503,'backup_cancel_unconfirmed');}throw cancelled();}throw error;}
}
