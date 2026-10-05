import {createHash} from 'node:crypto';
import {ok} from './problem.js';

const format='freedom-state-parts-v1',chunkBytes=120000,maxBytes=4*1024*1024;
type Manifest={format:typeof format;parts:number;bytes:number;sha256:string};
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
function manifest(value:any):value is Manifest{return value?.format===format;}
const key=(index:number)=>'state-part:'+index;

export async function readWorkspaceState<T>(storage:DurableObjectStorage):Promise<T|undefined>{
 const stored=await storage.get<T|Manifest>('state');
 if(!manifest(stored))return stored as T|undefined;
 ok(Number.isInteger(stored.parts)&&stored.parts>0&&stored.parts<=Math.ceil(maxBytes/chunkBytes)&&Number.isInteger(stored.bytes)&&stored.bytes>0&&stored.bytes<=maxBytes&&stored.parts===Math.ceil(stored.bytes/chunkBytes)&&/^[a-f0-9]{64}$/.test(stored.sha256),500,'state_storage_invalid','工作區儲存索引不符，未覆寫原資料');
 const entries=await storage.get<Uint8Array>(Array.from({length:stored.parts},(_,i)=>key(i)));
 const bytes=new Uint8Array(stored.bytes);let offset=0;
 for(let i=0;i<stored.parts;i++){const part=entries.get(key(i));ok(part instanceof Uint8Array&&part.length===Math.min(chunkBytes,stored.bytes-offset),500,'state_storage_invalid','工作區儲存片段不完整，未覆寫原資料');bytes.set(part,offset);offset+=part.length;}
 ok(hash(bytes)===stored.sha256,500,'state_storage_invalid','工作區儲存內容不符，未覆寫原資料');
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{ok(false,500,'state_storage_invalid','工作區儲存格式不符，未覆寫原資料');}
}

export async function writeWorkspaceState(storage:DurableObjectStorage,state:unknown):Promise<void>{
 const bytes=new TextEncoder().encode(JSON.stringify(state));ok(bytes.length<=maxBytes,422,'workspace_storage_limit','工作區儲存容量已達上限，請先匯出');
 await storage.transaction(async transaction=>{
  const previous=await transaction.get<any>('state');
  const oldParts=manifest(previous)?previous.parts:0;
  if(bytes.length<=1500000){await transaction.put('state',state);for(let i=0;i<oldParts;i++)await transaction.delete(key(i));return;}
  const parts=Math.ceil(bytes.length/chunkBytes);
  for(let i=0;i<parts;i++)await transaction.put(key(i),bytes.slice(i*chunkBytes,(i+1)*chunkBytes));
  await transaction.put('state',{format,parts,bytes:bytes.length,sha256:hash(bytes)} satisfies Manifest);
  for(let i=parts;i<oldParts;i++)await transaction.delete(key(i));
 });
}
