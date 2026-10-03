import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,command} from '../src/engine';
import {ApiError,forgetPending,isPendingVolatile,mutate,readPending,type View} from '../web/api';

async function fixture(run:(context:{values:Map<string,string>;blockWrites:()=>void;view:()=>View;world:()=>any;calls:any[];failResponse:(mode:'network'|'malformed'|'validation')=>void})=>Promise<void>){
 const originalFetch=globalThis.fetch,descriptor=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');const values=new Map<string,string>();let blocked=false;
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{if(blocked)throw Error('quota');values.set(key,value);},removeItem:(key:string)=>{if(blocked)throw Error('locked');values.delete(key);}}});forgetPending();
 let world=createWorld('general','API 恢復測試'),mode:string|undefined;const receipts=new Map<string,any>(),calls:any[]=[];
 globalThis.fetch=async(input:any,init?:RequestInit)=>{
  const headers=new Headers(init?.headers),key=headers.get('Idempotency-Key')!;calls.push({path:String(input),key,version:headers.get('If-Match-Version'),body:init?.body});
  if(mode==='validation'){mode=undefined;return Response.json({error:{code:'rejected',message:'測試驗證拒絕'}},{status:422});}
  let receipt=receipts.get(key);if(!receipt){const body=JSON.parse(String(init?.body));assert.equal(Number(headers.get('If-Match-Version')),world.version);receipt=command(world,body.action,body.payload);world=receipt.workspace;receipts.set(key,receipt);}
  if(mode==='network'){mode=undefined;throw new TypeError('response lost after commit');}if(mode==='malformed'){mode=undefined;return new Response('broken JSON');}
  return Response.json({...receipt,workspace:world,version:world.version,csrf:'test-csrf'});
 };
 try{await run({values,blockWrites:()=>{blocked=true;},view:()=>({workspace:world,version:world.version,csrf:'test-csrf',report:null}),world:()=>world,calls,failResponse:value=>{mode=value;}});}finally{blocked=false;forgetPending();globalThis.fetch=originalFetch;if(descriptor)Object.defineProperty(globalThis,'sessionStorage',descriptor);else delete (globalThis as any).sessionStorage;}
}

test('a quota failure cannot prevent an authorized simulation command or turn its acknowledgement into an error',async()=>fixture(async f=>{
 f.blockWrites();const result=await mutate('/api/workspace/commands',{action:'customer.create',payload:{name:'已確認顧客'}},f.view());assert.equal(result.workspace.customers.filter((c:any)=>c.name==='已確認顧客').length,1);assert.equal(f.calls.length,1);assert.equal(readPending(),null);
}));
test('an acknowledged command with a lost response replays its exact key body and version from memory',async()=>fixture(async f=>{
 f.blockWrites();f.failResponse('network');const before=f.view();await assert.rejects(mutate('/api/workspace/commands',{action:'customer.create',payload:{name:'只建立一次'}},before));const pending=readPending()!;assert.ok(pending);assert.equal(isPendingVolatile(),true);assert.equal(f.world().version,before.version+1);
 await mutate(pending.path,{},f.view(),pending);assert.deepEqual(f.calls[0],f.calls[1]);assert.equal(f.world().customers.filter((c:any)=>c.name==='只建立一次').length,1);assert.equal(readPending(),null);assert.equal(isPendingVolatile(),false);
}));
test('bad response JSON retains recovery metadata while a definitive validation rejection clears it',async()=>fixture(async f=>{
 f.failResponse('malformed');await assert.rejects(mutate('/api/workspace/commands',{action:'customer.create',payload:{name:'JSON 恢復'}},f.view()));const pending=readPending()!;assert.ok(pending);await mutate(pending.path,{},f.view(),pending);assert.equal(readPending(),null);
 f.failResponse('validation');await assert.rejects(mutate('/api/workspace/commands',{action:'customer.create',payload:{name:'未寫入'}},f.view()),ApiError);assert.equal(readPending(),null);assert.equal(f.world().customers.some((c:any)=>c.name==='未寫入'),false);
}));
test('a stale browser request cannot replace newer memory recovery metadata after writes fail',async()=>fixture(async f=>{
 f.failResponse('network');await assert.rejects(mutate('/api/workspace/commands',{action:'customer.create',payload:{name:'第一筆'}},f.view()));const old=readPending()!;await mutate(old.path,{},f.view(),old);f.values.set('freedom-erp.pending.v1',JSON.stringify(old));
 f.blockWrites();f.failResponse('network');await assert.rejects(mutate('/api/workspace/commands',{action:'customer.create',payload:{name:'第二筆'}},f.view()));const latest=readPending()!;assert.notEqual(latest.key,old.key);assert.match(latest.body,/第二筆/);await mutate(latest.path,{},f.view(),latest);assert.equal(readPending(),null);assert.equal(f.world().customers.filter((c:any)=>c.name==='第二筆').length,1);
}));
test('malformed or foreign pending paths are never submitted as recovery requests',async()=>fixture(async f=>{
 f.values.set('freedom-erp.pending.v1',JSON.stringify({key:'valid-key',path:'https://example.invalid/',body:'{}',version:0}));assert.equal(readPending(),null);await assert.rejects(mutate('/api/workspace/commands',{},f.view(),{key:'valid-key',path:'https://example.invalid/',body:'{}',version:0}),ApiError);assert.equal(f.calls.length,0);
}));
