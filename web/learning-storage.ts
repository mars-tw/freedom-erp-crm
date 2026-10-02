import type {Pending, RecordData, Workspace} from './api';
import {captureLearningCheckpoint,isLearningSession,type LearningPathId,type LearningSession} from './learning';
import {learningFacts,readLearningView,writeLearningView,type LearningFact} from './learning-view';

const prefix='freedom-erp.learning.v1.';
const pendingKey=prefix+'pending';
const memory=new Map<string,string>();
const blockedWrites=new Set<string>();
function read(key:string):unknown {
  let raw=memory.get(key);if(!blockedWrites.has(key))try{raw=sessionStorage.getItem(key)??raw;}catch{}
  try{return raw?JSON.parse(raw):null;}catch{return null;}
}
function save(key:string,value:unknown){
  const json=JSON.stringify(value);memory.set(key,json);
  try {sessionStorage.setItem(key,json);blockedWrites.delete(key);} catch {blockedWrites.add(key);}
}
function remove(key:string){memory.delete(key);try{sessionStorage.removeItem(key);blockedWrites.delete(key);}catch{blockedWrites.add(key);}}
const keyFor=(generation:string,path:LearningPathId)=>prefix+generation+'.'+path;
export function readLearningSession(w:Workspace,path:LearningPathId):LearningSession|null {
  const value=read(keyFor(w.generation_id,path));return isLearningSession(value,w,path)?value:null;
}
export function readActiveLearningSession(w:Workspace):LearningSession|null {
  const path=read(prefix+w.generation_id+'.active');
  return path==='sales'||path==='manufacturing'||path==='service'?readLearningSession(w,path):null;
}
export function writeLearningSession(session:LearningSession){save(keyFor(session.generation,session.path),session);save(prefix+session.generation+'.active',session.path);}
export function rememberLearningOperation(session:LearningSession,stepId:string,command:{action:string;payload:RecordData},version:number,before?:LearningFact[]){
  save(pendingKey,{session,stepId,command,version,before});
}
export function forgetLearningOperation(){remove(pendingKey);}

/** A recovered API receipt belongs to a lesson only if its original request matches. */
export function acknowledgeLearningOperation(request:{action:string;payload:RecordData;version:number},result:string,updated:Workspace,receiptVersion=updated.version){
  const value:any=read(pendingKey);
  if(!value||!isLearningSession(value.session,updated)||typeof value.stepId!=='string')return;
  if(value.version!==request.version||value.command?.action!==request.action||JSON.stringify(value.command.payload)!==JSON.stringify(request.payload))return;
  try{const session=captureLearningCheckpoint(value.session,value.stepId,value.command,result,updated,receiptVersion);
    writeLearningSession(session);
    // A newer world cannot supply this operation's historical "after" values.
    const validBefore=Array.isArray(value.before)&&value.before.length<=12&&value.before.every((row:any)=>row&&typeof row.label==='string'&&row.label.length<=180&&typeof row.value==='string'&&row.value.length<=240);
    if(validBefore&&updated.version===receiptVersion){
      const state=readLearningView(updated,session),after=learningFacts(updated,session,'lesson');
      const snapshot={version:receiptVersion,result,rows:after.map(row=>({label:row.label,before:value.before.find((previous:LearningFact)=>previous.label.split(' ·')[0]===row.label.split(' ·')[0])?.value??'—',after:row.value}))};
      writeLearningView(updated,session,{...state,snapshots:{...state.snapshots,[value.stepId]:snapshot}});
    }
    remove(pendingKey);
  }catch{remove(pendingKey);}
}
export function acknowledgeRecoveredLearning(pending:Pending,result:string,updated:Workspace,receiptVersion=updated.version){
  if(pending.path!=='/api/workspace/commands')return;
  try{const body=JSON.parse(pending.body);acknowledgeLearningOperation({...body,version:pending.version},result,updated,receiptVersion);}catch{}
}
