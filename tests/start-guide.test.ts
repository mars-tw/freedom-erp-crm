import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,command} from '../src/engine.js';
import {starterRoute,starterEvidence,readGuideHidden,writeGuideHidden} from '../web/start-guide.js';
const values=new Map<string,string>();let rejectRead=false,rejectWrite=false;
Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem(key:string){if(rejectRead)throw Error('blocked');return values.get(key)??null;},setItem(key:string,value:string){if(rejectWrite)throw Error('blocked');values.set(key,value);}}});
test('every supported starter combination links to an enabled module',()=>{
 for(const [modules,expected] of [[['inventory'],'inventory'],[['crm','wallets','services'],'services'],[['crm'],'crm'],[['administration'],'administration'],[['projects'],'projects'],[['wallets'],'wallets']] as [string[],string][]){const w=createWorld('general','合成公司',modules);const before=JSON.stringify(w);assert.equal(starterRoute(w).module,expected);assert.ok(w.modules.includes(starterRoute(w).module));assert.equal(JSON.stringify(w),before);}
});
test('template samples and merely opening pages never count as completed work',()=>{
 const w=createWorld('general','合成公司');const before=JSON.stringify(w);assert.deepEqual(starterEvidence(w),{records:false,operation:false});starterRoute(w);assert.equal(JSON.stringify(w),before);
 const updated=command(w,'customer.create',{name:'合成客戶'}).workspace;assert.deepEqual(starterEvidence(updated),{records:true,operation:false});
 const completed=command(updated,'task.update',{id:updated.tasks[0].id,status:'done'}).workspace;assert.deepEqual(starterEvidence(completed),{records:true,operation:true});
});
test('administrative and wallet-only operations are counted from actual history',()=>{
 const w=createWorld('general','合成公司');w.history.push({action:'office.attendance.create'});assert.equal(starterEvidence(w).operation,true);
 const wallet=createWorld('general','合成錢包',['wallets']);const seeded=command(wallet,'wallet.fund',{wallet_id:wallet.wallets.find((v:any)=>v.kind==='business').id,amount_minor:100}).workspace;assert.equal(starterEvidence(seeded).operation,true);assert.equal(starterEvidence(seeded).records,false);
});
test('dismissal is strictly parsed and isolated by workspace generation',()=>{
 assert.equal(readGuideHidden('alpha'),false);assert.equal(writeGuideHidden('alpha',true),true);assert.equal(readGuideHidden('alpha'),true);assert.equal(readGuideHidden('beta'),false);
 for(const value of ['{bad','null','[]','{"version":2,"hidden":true}','{"version":1,"hidden":"true"}','{"version":1,"hidden":true,"company":"unexpected"}']){values.set('first-run-guide.v1.beta',value);assert.equal(readGuideHidden('beta'),false);}
 assert.equal(writeGuideHidden('',true),false);assert.equal(writeGuideHidden('x'.repeat(101),true),false);assert.equal(writeGuideHidden('alpha',false),true);assert.equal(readGuideHidden('alpha'),false);
});
test('failed storage writes preserve current-tab intent instead of reusing stale preferences',()=>{
 writeGuideHidden('blocked',false);rejectWrite=true;try{assert.equal(writeGuideHidden('blocked',true),false);assert.equal(readGuideHidden('blocked'),true);rejectRead=true;assert.equal(readGuideHidden('blocked'),true);assert.equal(readGuideHidden('other'),false);}finally{rejectRead=false;rejectWrite=false;}assert.equal(readGuideHidden('blocked'),true);writeGuideHidden('blocked',false);assert.equal(readGuideHidden('blocked'),false);
});

test('minimal enabled-module workspaces have attainable record and operation progress',()=>{
 let w=createWorld('general','合成庫存',['inventory']);w=command(w,'product.update',{id:w.products[0].id,name:'我的假商品'}).workspace;assert.deepEqual(starterEvidence(w),{records:true,operation:true});
 let wallets=createWorld('general','合成錢包',['wallets']);wallets=command(wallets,'wallet.create',{name:'合成買家',kind:'buyer'}).workspace;assert.equal(starterEvidence(wallets).records,true);
 const office=createWorld('general','合成行政',['administration']);office.history.push({action:'office.shift.create'});assert.equal(starterEvidence(office).records,true);
});
