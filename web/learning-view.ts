import type {RecordData,Workspace} from './api';
import {availablePaths,isLearningSession,type LearningSession} from './learning';
export interface LearningFact {label:string;value:string}
export interface LearningSnapshot {version:number;result:string;rows:{label:string;before:string;after:string}[]}
export interface LearningViewState {selectedStep:string|null;choice:number|null;scope:'lesson'|'workspace';compact:boolean;snapshots:Record<string,LearningSnapshot>}
export const emptyLearningView=():LearningViewState=>({selectedStep:null,choice:null,scope:'lesson',compact:false,snapshots:{}});
const money=(n:number)=>`${new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(n/100)} SIM`;
const sum=(items:RecordData[],key:string)=>items.reduce((n,v)=>n+Number(v[key]??0),0);
const fact=(label:string,value:string):LearningFact=>({label,value});
const find=(items:RecordData[]|undefined,id:unknown)=>items?.find(v=>v.id===id);
/** Lesson totals only follow this run's checkpoints. Shared balances and stock remain explicitly labeled. */
export function learningFacts(w:Workspace,s:LearningSession,scope:'lesson'|'workspace'='lesson'):LearningFact[]{
 if(!isLearningSession(s,w))return [];
 const business=money(sum(w.wallets.filter(v=>v.kind==='business'),'balance_minor'));
 if(scope==='workspace'){
  const common=[fact('工作區商家測試幣',business),fact('工作區買家測試幣',money(sum(w.wallets.filter(v=>v.kind==='buyer'),'balance_minor')))];
  if(s.path==='sales')return [fact('工作區顧客',`${w.customers.length} 位`),fact('工作區商品現有量',`${sum(w.products,'on_hand')} 件`),fact('工作區預留庫存',`${sum(w.products,'reserved')} 件`),fact('工作區訂單',`${w.orders.length} 筆`),fact('工作區訂單已付款',money(sum(w.orders,'paid_minor'))),fact('工作區已出貨',`${w.orders.reduce((n,o)=>n+sum(o.lines??[],'shipped_quantity'),0)} 件`),...common];
  if(s.path==='service')return [fact('工作區案件',`${w.cases.length} 件`),fact('工作區報價',`${w.quotes.length} 份`),fact('工作區交付版本',`${w.services.reduce((n,v)=>n+(v.deliveries?.length??0),0)} 份`),fact('工作區已驗收服務',`${w.services.filter(v=>v.status==='accepted').length} 件`),fact('工作區服務收款',money(sum(w.services,'paid_minor'))),...common];
  return [fact('工作區庫存現有量',`${sum(w.products,'on_hand')} 件`),fact('工作區預留庫存',`${sum(w.products,'reserved')} 件`),fact('工作區庫存成本',money(sum(w.products,'stock_value_minor'))),fact('工作區 BOM 版本',`${w.boms.length} 份`),fact('工作區完工工單',`${w.workOrders.filter(v=>v.status==='completed').length} 張`),fact('工作區完工數量',`${w.workOrders.filter(v=>v.status==='completed').reduce((n,v)=>n+v.quantity,0)} 件`),...common];
 }
 const checkpoint=(id:string)=>{const c=s.checkpoints.find(v=>v.stepId===id);return c&&w.history?.some((h:RecordData)=>h.action===c.action&&h.result===c.result&&h.version===c.version)?c:undefined;};
 const customer=find(w.customers,checkpoint('customer')?.result);const buyerRow=find(w.wallets,checkpoint('buyer')?.result);const buyer=buyerRow?.name===(`教學買家 ${s.runId}`)&&buyerRow.kind==='buyer'?buyerRow:undefined;
 const common=[fact('共用商家測試幣',business),fact('本輪買家測試幣',money(buyer?.balance_minor??0))];
 if(s.path==='sales'){const o=find(w.orders,checkpoint('order')?.result);const own=o?.learning_run_id===s.runId&&o.buyer_wallet_id===buyer?.id?o:undefined;const product=find(w.products,checkpoint('receive')?.payload.product_id)??w.products.find(p=>p.active&&Number.isSafeInteger(p.price_minor)&&p.price_minor>0);return [fact('本輪顧客',`${customer?.name===`教學客戶 ${s.runId}`?1:0} 位`),fact('本輪訂單',`${own?1:0} 筆`),fact('本輪訂單已付款',money(own?.paid_minor??0)),fact('本輪已出貨',`${sum(own?.lines??[],'shipped_quantity')} 件`),fact(`共用商品現有量${product?' · '+product.name:''}`,`${product?.on_hand??0} 件`),fact('共用商品預留',`${product?.reserved??0} 件`),...common];}
 if(s.path==='service'){const c=find(w.cases,checkpoint('case')?.result);const ownCase=c?.title===`教學服務案件 ${s.runId}`&&c.customer_id===customer?.id?c:undefined;const q=find(w.quotes,checkpoint('quote')?.result);const service=find(w.services,checkpoint('service')?.result);const ownService=service?.case_id===ownCase?.id?service:undefined;return [fact('本輪案件',`${ownCase?1:0} 件`),fact('本輪報價',`${q&&q.case_id===ownCase?.id?1:0} 份`),fact('本輪交付版本',`${ownService?.deliveries?.length??0} 份`),fact('本輪已驗收服務',`${ownService?.status==='accepted'?1:0} 件`),fact('本輪服務收款',money(ownService?.paid_minor??0)),...common];}
 const o=find(w.workOrders,checkpoint('work-order')?.result);const own=o?.learning_run_id===s.runId?o:undefined;
 const receive=checkpoint('receive');const bom=own?.bom_snapshot??w.boms.find(b=>b.components?.length===1&&b.components[0].product_id===receive?.payload.product_id&&b.components[0].quantity===receive?.payload.quantity)??(!receive?w.boms.find(b=>find(w.products,b.product_id)?.active&&b.components?.length===1&&find(w.products,b.components[0].product_id)?.active):undefined);
 const material=find(w.products,bom?.components?.[0]?.product_id??receive?.payload.product_id);const finished=find(w.products,bom?.product_id);
 return [fact('本輪工單',`${own?1:0} 張`),fact('本輪完工數量',`${own?.status==='completed'?own.quantity:0} 件`),fact('本輪完工成本',money(own?.status==='completed'?own.actual_cost_minor:0)),fact(`共用材料現有量${material?' · '+material.name:''}`,`${material?.on_hand??0} 件`),fact(`共用成品現有量${finished?' · '+finished.name:''}`,`${finished?.on_hand??0} 件`),fact('共用材料預留',`${material?.reserved??0} 件`),fact('共用商家測試幣',business)];
}
const prefix='freedom-erp.learning-view.v1.';
const memory=new Map<string,string>();const blockedWrites=new Set<string>();
const key=(w:Workspace,s:LearningSession)=>prefix+encodeURIComponent(w.generation_id)+'.'+s.path+'.'+s.runId;
const shape=(v:unknown):v is RecordData=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
function validate(w:Workspace,s:LearningSession,value:unknown):LearningViewState|null{
 try{
  if(!isLearningSession(s,w)||!shape(value)||JSON.stringify(value).length>65536||Object.keys(value).some(k=>!['selectedStep','choice','scope','compact','snapshots'].includes(k)))return null;
  const steps=availablePaths(w).find(p=>p.id===s.path)!.steps;const ids=new Set(steps.map(v=>v.id));
  if(!(value.selectedStep===null||typeof value.selectedStep==='string'&&ids.has(value.selectedStep))||!(value.choice===null||Number.isInteger(value.choice)&&value.choice>=0&&value.choice<=2)||!['lesson','workspace'].includes(value.scope)||typeof value.compact!=='boolean'||!shape(value.snapshots)||Object.keys(value.snapshots).length>steps.length)return null;
  const snapshots:Record<string,LearningSnapshot>={};
  for(const [id,v]of Object.entries(value.snapshots)){
   if(!ids.has(id)||!shape(v)||Object.keys(v).some(k=>!['version','result','rows'].includes(k))||!Number.isSafeInteger(v.version)||!text(v.result,100)||!Array.isArray(v.rows)||v.rows.length>12)continue;
   const c=s.checkpoints.find(c=>c.stepId===id);if(!c||v.version!==c.version||v.result!==c.result||!w.history?.some((h:RecordData)=>h.action===c.action&&h.result===c.result&&h.version===c.version))continue;
   if(!v.rows.every((r:unknown)=>shape(r)&&Object.keys(r).every(k=>['label','before','after'].includes(k))&&text(r.label,180)&&text(r.before,240)&&text(r.after,240)))continue;
   snapshots[id]={version:v.version,result:v.result,rows:v.rows.map((r:RecordData)=>({label:r.label,before:r.before,after:r.after}))};
  }
  return {selectedStep:value.selectedStep,choice:value.choice,scope:value.scope,compact:value.compact,snapshots};
 }catch{return null;}
}
export function readLearningView(w:Workspace,s:LearningSession):LearningViewState{
 try{if(!isLearningSession(s,w))return emptyLearningView();const k=key(w,s);let raw=memory.get(k);if(!blockedWrites.has(k))try{raw=sessionStorage.getItem(k)??raw;}catch{}
 if(!raw||raw.length>65536)return emptyLearningView();return validate(w,s,JSON.parse(raw))??emptyLearningView();}catch{return emptyLearningView();}
}
export function writeLearningView(w:Workspace,s:LearningSession,state:LearningViewState):void{
 try{const valid=validate(w,s,state);if(!valid)return;const k=key(w,s),raw=JSON.stringify(valid);memory.set(k,raw);if(memory.size>64){const oldest=memory.keys().next().value;if(oldest){memory.delete(oldest);blockedWrites.delete(oldest);}}
 try{sessionStorage.setItem(k,raw);blockedWrites.delete(k);}catch{blockedWrites.add(k);}}catch{/* A malformed cached view must never block the lesson. */}
}
