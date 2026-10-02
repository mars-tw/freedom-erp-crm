import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,command,validateWorld} from '../src/engine';
import type {Workspace} from '../web/api';
import {createLearningSession,evaluateLearning,prepareLearningCommand} from '../web/learning';
import {acknowledgeLearningOperation,acknowledgeRecoveredLearning,readActiveLearningSession,readLearningSession,rememberLearningOperation,writeLearningSession} from '../web/learning-storage';

function storage(){const values=new Map<string,string>();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)}});return values;}
function scenario(){const w=createWorld('general','教學收據測試') as Workspace;const session=createLearningSession(w,'sales');const next=prepareLearningCommand(w,session,'customer');assert.ok('action' in next);writeLearningSession(session);rememberLearningOperation(session,'customer',next,w.version);const applied=command(w,next.action,next.payload);return {w,session,next,applied};}

test('recovered learning receipt uses original version even after an unrelated subsequent mutation',()=>{
 storage();const {w,session,next,applied}=scenario();const later=command(applied.workspace,'task.create',{title:'另一個分頁的待辦'});
 acknowledgeRecoveredLearning({key:'same-receipt',path:'/api/workspace/commands',body:JSON.stringify({action:next.action,payload:next.payload}),version:w.version},applied.result,later.workspace,applied.workspace.version);
 const resumed=readLearningSession(later.workspace,'sales');assert.ok(resumed);assert.equal(resumed.runId,session.runId);assert.equal(resumed.checkpoints[0].version,applied.workspace.version);assert.equal(evaluateLearning(later.workspace,resumed).nextIndex,1);assert.equal(later.workspace.customers.filter((x:any)=>x.id===applied.result).length,1);
});
test('a different request cannot consume a pending teaching checkpoint',()=>{
 storage();const {w,next,applied}=scenario();acknowledgeLearningOperation({action:next.action,payload:{name:'其他客戶'},version:w.version},applied.result,applied.workspace);
 assert.equal(readLearningSession(applied.workspace,'sales')?.checkpoints.length,0);
 acknowledgeLearningOperation({...next,version:w.version},applied.result,applied.workspace);assert.equal(readLearningSession(applied.workspace,'sales')?.checkpoints.length,1);
});
test('reset or imported generations never receive another workspace lesson progress',()=>{
 storage();const {w,next,applied}=scenario();const other=createWorld('retail','另一個工作區') as Workspace;acknowledgeLearningOperation({...next,version:w.version},applied.result,other);assert.equal(readLearningSession(other,'sales'),null);assert.equal(readLearningSession(applied.workspace,'sales')?.checkpoints.length,0);
});
test('malformed browser state and invalid checkpoints are ignored',()=>{
 const values=storage();const {w,session}=scenario();const key=`freedom-erp.learning.v1.${w.generation_id}.sales`;values.set(key,'broken JSON');assert.equal(readLearningSession(w,'sales'),null);values.set(key,JSON.stringify({...session,checkpoints:[{stepId:'ship',result:'fake'}]}));assert.equal(readLearningSession(w,'sales'),null);
});
test('blocked browser storage still permits practice within the mounted tab',()=>{
 storage();Object.defineProperty(globalThis,'sessionStorage',{configurable:true,get(){throw Error('browser storage blocked');}});const {w,next,applied}=scenario();acknowledgeLearningOperation({...next,version:w.version},applied.result,applied.workspace);assert.equal(readLearningSession(applied.workspace,'sales')?.checkpoints.length,1);
});
test('returning to a multi-route workspace resumes the last chosen valid lesson',()=>{
 storage();const w=createWorld('general','多路線接續') as Workspace;const sales=createLearningSession(w,'sales'),factory=createLearningSession(w,'manufacturing');writeLearningSession(sales);writeLearningSession(factory);assert.equal(readActiveLearningSession(w)?.runId,factory.runId);assert.equal(readLearningSession(w,'sales')?.runId,sales.runId);
});
test('learning metadata rejects malformed commands and forged imported metadata',()=>{
 storage();const w=createWorld('manufacturing','工單識別測試');assert.throws(()=>command(w,'workOrder.create',{bom_id:w.boms[0].id,quantity:1,learning_run_id:'invalid space'}));
 assert.throws(()=>command(w,'customer.create',{name:'不可加識別',learning_run_id:'valid-run-id'}));
 const tagged=command(w,'workOrder.create',{bom_id:w.boms[0].id,quantity:1,learning_run_id:'valid-run-id'}).workspace;tagged.workOrders[0].learning_run_id={unexpected:'object'};assert.throws(()=>validateWorld(tagged));
});
