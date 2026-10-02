import type {RecordData, Workspace} from './api';
export type LearningPathId = 'sales' | 'manufacturing' | 'service';
export interface LearningCheckpoint {stepId:string;action:string;payload:RecordData;result:string;version:number}
export interface LearningSession {generation:string;path:LearningPathId;runId:string;checkpoints:LearningCheckpoint[]}
export interface LearningStep {id:string;title:string;body:string;change:string;nav:string;node:string}
export interface LearningPath {id:LearningPathId;title:string;subtitle:string;modules:string[];steps:LearningStep[]}
export interface LearningCommand {action:string;payload:RecordData;preview:string}
const step=(id:string,title:string,body:string,change:string,nav:string,node:string):LearningStep=>({id,title,body,change,nav,node});
const paths:LearningPath[]=[
 {id:'sales',title:'把第一筆訂單送出去',subtitle:'從顧客到出貨，練習一筆完整的模擬交易。',modules:['crm','wallets','inventory','sales'],steps:[
 step('customer','建立練習顧客','建立本次教學專用顧客，方便辨認這次練習。','新增一位顧客。','crm','customer'),
 step('buyer','建立買家錢包','建立本次專用錢包，稍後用它支付測試幣。','新增餘額為零的買家錢包。','wallets','wallet'),
 step('fund-business','準備進貨測試幣','明確補充商家測試幣，供下一步進貨使用。','補入本次採購所需 SIM，補幣流水同步建立。','wallets','wallet'),
 step('receive','進貨一件商品','採用一件啟用中的商品，成本依目前商品設定。','庫存增加一件，留下採購與 FIFO 成本層。','inventory','inventory'),
 step('fund-buyer','準備買家測試幣','補入恰好等於這件商品售價的測試幣。','本次買家錢包增加本筆售價。','wallets','wallet'),
 step('order','建立訂單','只用本次專用買家與剛進貨的商品建立一件訂單。','建立訂單並預留一件庫存。','sales','order'),
 step('pay','付清訂單','用本次買家錢包付清這筆模擬訂單。','測試幣移至商家，訂單付款狀態更新。','sales','order'),
 step('ship','出貨','付款完成後，把本筆訂單的一件商品出貨。','庫存與預留各減一件，出貨成本採 FIFO。','sales','inventory') ]},
 {id:'manufacturing',title:'把材料做成成品',subtitle:'沿著一份 BOM，練習預留材料、開工與完工。',modules:['manufacturing','inventory','wallets'],steps:[
 step('fund-business','準備材料測試幣','明確補充商家測試幣，用於本次材料採購。','補入本次材料採購所需 SIM。','wallets','wallet'),
 step('receive','採購本次材料','教學採用只有一種元件的 BOM；多元件請先在製造模組練習。','材料數量增加，留下採購成本層。','inventory','inventory'),
 step('work-order','建立製作單','建立本次專屬工單，計畫製作一件成品。','工單凍結 BOM 版本，狀態為計畫中。','manufacturing','production'),
 step('reserve','預留材料','檢查材料足夠後，預留本次工單需要的數量。','可用材料减少，實際庫存尚未扣除。','manufacturing','inventory'),
 step('start','開始製作','把本次工單從已預留推進至製作中。','工單進入製作中。','manufacturing','production'),
 step('complete','完成製作','依 FIFO 消耗材料，將成本完整轉入一件成品。','材料減少、成品增加；測試幣流水不因製作改動。','manufacturing','inventory') ]},
 {id:'service',title:'完成一件服務委託',subtitle:'從案件、報價到交付驗收，最後收取測試幣。',modules:['crm','services','wallets'],steps:[
 step('customer','建立委託客戶','建立本次服務練習專用客戶。','新增一位客戶。','crm','customer'),
 step('case','建立服務案件','把本次客戶與新案件連在一起。','新增本次教學案件。','crm','case'),
 step('quote','起草模擬報價','本次以 1,000 SIM 示範報價，有效期限為七天。','新增報價草稿，沒有正式契約效力。','crm','quote'),
 step('issue','發出報價','發出本次報價，金額與有效期限將凍結。','產生報價摘要，同案件舊報價會失效。','crm','quote'),
 step('confirm-quote','確認最新報價','只使用本次最新報價的摘要確認。','留下模擬確認，沒有法律效力。','crm','quote'),
 step('service','建立模擬服務','沿用本次案件與已確認報價金額。','新增服務草稿，價格來源為明確的模擬輸入。','services','service'),
 step('confirm-service','確認服務內容','將本次服務推進到可提交交付物的狀態。','服務狀態更新為已確認。','services','service'),
 step('deliver','提交教學交付物','提交本次專用的教學交付標記。','新增交付版本與摘要，等待模擬驗收。','services','delivery'),
 step('accept','驗收最新交付','核對最新交付識別與摘要後驗收。','服務標記為已驗收。','services','delivery'),
 step('buyer','建立付款錢包','建立本次委託方專用的測試幣錢包。','新增餘額為零的買家錢包。','wallets','wallet'),
 step('fund-buyer','準備服務測試幣','補入恰好等於服務金額的測試幣。','本次買家收到 1,000 SIM。','wallets','wallet'),
 step('pay','支付服務測試幣','只對本次已驗收服務支付測試幣。','服務收款更新，錢包流水保持守恆。','services','wallet') ]}
];
const actions:Record<LearningPathId,Record<string,string>>={sales:{customer:'customer.create',buyer:'wallet.create','fund-business':'wallet.fund',receive:'inventory.receive','fund-buyer':'wallet.fund',order:'order.create',pay:'order.pay',ship:'order.ship'},manufacturing:{'fund-business':'wallet.fund',receive:'inventory.receive','work-order':'workOrder.create',reserve:'workOrder.reserve',start:'workOrder.start',complete:'workOrder.complete'},service:{customer:'customer.create',case:'case.create',quote:'quote.create',issue:'quote.issue','confirm-quote':'quote.confirm',service:'service.create','confirm-service':'service.confirm',deliver:'service.deliver',accept:'service.accept',buyer:'wallet.create','fund-buyer':'wallet.fund',pay:'service.pay'}};
export function availablePaths(w:Workspace):LearningPath[]{return paths.filter(p=>p.modules.every(m=>w.modules.includes(m)));}
export function createLearningSession(w:Workspace,path:LearningPathId):LearningSession{if(!availablePaths(w).some(p=>p.id===path))throw new Error('目前工作區未啟用這條教學需要的模組。');return {generation:w.generation_id,path,runId:crypto.randomUUID(),checkpoints:[]};}
export function validateLearningSession(w:Workspace,s:unknown):s is LearningSession{
 try{if(!s||typeof s!=='object'||Array.isArray(s))return false;const v=s as LearningSession;const p=paths.find(p=>p.id===v.path);
 if(Object.keys(v).some(k=>!['generation','path','runId','checkpoints'].includes(k))||!p||!availablePaths(w).some(x=>x.id===p.id)||v.generation!==w.generation_id||typeof v.runId!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(v.runId)||!Array.isArray(v.checkpoints)||v.checkpoints.length>p.steps.length)return false;
 let version=-1;return v.checkpoints.every((c,i)=>!!c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).every(k=>['stepId','action','payload','result','version'].includes(k))&&c.stepId===p.steps[i].id&&c.action===actions[p.id][c.stepId]&&typeof c.result==='string'&&c.result.length>0&&c.result.length<=100&&Number.isSafeInteger(c.version)&&c.version>version&&(version=c.version)<=w.version&&!!c.payload&&typeof c.payload==='object'&&!Array.isArray(c.payload)&&JSON.stringify(c.payload).length<=32768);}catch{return false;}
}
const row=(items:RecordData[]|undefined,id:unknown)=>items?.find(v=>v.id===id);
const cp=(s:LearningSession,id:string)=>s.checkpoints.find(c=>c.stepId===id);
const ownName=(s:LearningSession,kind:string)=>`教學${kind} ${s.runId}`;
function historyMatches(w:Workspace,c:LearningCheckpoint){return Array.isArray(w.history)&&w.history.some((h:RecordData)=>h.version===c.version&&h.action===c.action&&h.result===c.result);}
function evidenceFor(w:Workspace,s:LearningSession,c:LearningCheckpoint):string|null{
 const p=c.payload;const previous=(id:string)=>cp(s,id);const record=(list:RecordData[])=>row(list,c.result);const buyer=previous('buyer');const business=w.wallets.find(v=>v.kind==='business');
 if(c.stepId==='customer'){const v=record(w.customers);return v?.name===ownName(s,'客戶')&&p.name===v.name?'本次教學客戶已建立。':null;}
 if(c.stepId==='buyer'){const v=record(w.wallets);return v?.kind==='buyer'&&v.name===ownName(s,'買家')&&p.kind==='buyer'&&p.name===v.name?'本次專用買家錢包已建立。':null;}
 if(c.action==='wallet.fund'){const ledger=record(w.ledger);const wallet=c.stepId==='fund-business'?business:row(w.wallets,buyer?.result);let expectedAmount:number|undefined;if(c.stepId==='fund-business'){const received=previous('receive'),purchase=row(w.purchases,received?.result);let cost=purchase?.total_minor;if(cost===undefined){if(s.path==='sales')cost=w.products.find(v=>v.active&&v.price_minor>0)?.cost_minor;else{const b=w.boms.find(b=>row(w.products,b.product_id)?.active&&b.components?.length===1&&row(w.products,b.components[0].product_id)?.active);cost=b?row(w.products,b.components[0].product_id)?.cost_minor*b.components[0].quantity:undefined;}}expectedAmount=Number.isSafeInteger(cost)?Math.max(100,cost):undefined;}else if(s.path==='service')expectedAmount=row(w.services,previous('service')?.result)?.amount_minor;else{const order=row(w.orders,previous('order')?.result),received=previous('receive');expectedAmount=order?.total_minor??row(w.products,received?.payload.product_id)?.price_minor;}return p.amount_minor===expectedAmount&&ledger?.kind==='wallet.fund'&&p.wallet_id===wallet?.id&&Number.isSafeInteger(p.amount_minor)&&p.amount_minor>0&&ledger.entries.some((e:RecordData)=>e.wallet_id===wallet?.id&&e.amount_minor===p.amount_minor)?`已補入 ${(p.amount_minor/100).toLocaleString('zh-TW')} SIM，流水可查。`:null;}
 if(c.stepId==='receive'){const purchase=record(w.purchases);const product=row(w.products,p.product_id);return purchase&&product&&purchase.product_id===p.product_id&&purchase.quantity===p.quantity&&Number.isSafeInteger(p.quantity)&&p.quantity>0?'本次採購與成本層已建立。':null;}
 if(s.path==='sales'){
  const o=row(w.orders,previous('order')?.result);if(c.stepId==='order'){const v=record(w.orders),receive=previous('receive');return v&&v.learning_run_id===s.runId&&p.learning_run_id===s.runId&&p.buyer_wallet_id===buyer?.result&&v.buyer_wallet_id===buyer?.result&&p.lines?.length===1&&v.lines?.length===1&&p.lines[0].product_id===receive?.payload.product_id&&p.lines[0].quantity===1&&v.lines[0].product_id===p.lines[0].product_id&&v.lines[0].quantity===1?'本次訂單已建立；其後付款與出貨仍屬於這筆訂單。':null;}
  if(c.stepId==='pay')return o&&c.result===o.id&&p.id===o.id&&p.amount_minor===o.total_minor&&o.paid_minor===o.total_minor?'本次訂單已付清測試幣。':null;
  if(c.stepId==='ship')return o&&p.id===o.id&&c.result===o.id&&p.lines?.length===1&&p.lines[0].line_id===o.lines[0]?.id&&p.lines[0].quantity===1&&o.lines[0].shipped_quantity===1?'本次訂單已出貨一件，成本依 FIFO 扣除。':null;
 }
 if(s.path==='manufacturing'){
  const o=row(w.workOrders,previous('work-order')?.result);if(c.stepId==='work-order'){const v=record(w.workOrders),r=previous('receive');return v&&v.learning_run_id===s.runId&&p.learning_run_id===s.runId&&v.bom_id===p.bom_id&&p.quantity===1&&v.quantity===1&&v.bom_snapshot?.components?.length===1&&v.bom_snapshot.components[0].product_id===r?.payload.product_id&&v.bom_snapshot.components[0].quantity===r?.payload.quantity?'本次製作單與 BOM 快照已建立。':null;}
  if(c.stepId==='reserve')return o&&p.id===o.id&&c.result===o.id&&['reserved','started','completed'].includes(o.status)?'本次工單已預留材料。':null;
  if(c.stepId==='start')return o&&p.id===o.id&&c.result===o.id&&['started','completed'].includes(o.status)?'本次工單已開工。':null;
  if(c.stepId==='complete')return o&&p.id===o.id&&c.result===o.id&&o.status==='completed'&&Number.isSafeInteger(o.actual_cost_minor)?'本次工單已完工，材料成本已轉入成品。':null;
 }
 if(s.path==='service'){
  const caseCP=previous('case'),q=row(w.quotes,previous('quote')?.result),service=row(w.services,previous('service')?.result);
  if(c.stepId==='case'){const v=record(w.cases);return v&&v.customer_id===previous('customer')?.result&&p.customer_id===v.customer_id&&v.title===ownName(s,'服務案件')&&p.title===v.title?'本次客戶與服務案件已連結。':null;}
  if(c.stepId==='quote'){const v=record(w.quotes);return v&&v.case_id===caseCP?.result&&p.case_id===v.case_id&&v.amount_minor===100000&&p.amount_minor===v.amount_minor&&v.expires_at===p.expires_at?'本次模擬報價草稿已建立。':null;}
  if(c.stepId==='issue')return q&&c.result===q.id&&p.id===q.id&&['issued','simulated_confirmed'].includes(q.status)&&typeof q.digest==='string'?'本次報價已發出並凍結內容。':null;
  if(c.stepId==='confirm-quote')return q&&c.result===q.id&&p.id===q.id&&p.digest===q.digest&&q.status==='simulated_confirmed'&&q.legal_confirmation===false?'本次報價已模擬確認，沒有法律效力。':null;
  if(c.stepId==='service'){const v=record(w.services);return v&&p.case_id===caseCP?.result&&v.case_id===p.case_id&&p.amount_minor===q?.amount_minor&&v.amount_minor===p.amount_minor&&v.currency==='SIM'?'本次服務已建立，金額沿用模擬報價。':null;}
  if(c.stepId==='confirm-service')return service&&c.result===service.id&&p.id===service.id&&service.status!=='draft'?'本次服務已確認。':null;
  if(c.stepId==='deliver'){const d=service?.deliveries?.find((v:RecordData)=>v.artifact_ref===ownName(s,'交付物'));return service&&p.id===service.id&&c.result===service.id&&p.artifact_ref===ownName(s,'交付物')&&d&&service.latest_delivery_id===d.id?'本次交付版本已提交，摘要可核對。':null;}
  if(c.stepId==='accept')return service&&c.result===service.id&&p.id===service.id&&service.status==='accepted'&&p.delivery_id===service.latest_delivery_id&&row(service.deliveries,p.delivery_id)?.digest===p.digest?'本次最新交付已模擬驗收。':null;
  if(c.stepId==='pay')return service&&c.result===service.id&&p.id===service.id&&p.buyer_wallet_id===buyer?.result&&p.amount_minor===service.amount_minor&&service.paid_minor===service.amount_minor?'本次服務已收到全額測試幣。':null;
 }
 return null;
}
export function isLearningSession(value:unknown,w:Workspace,path?:LearningPathId):value is LearningSession{return validateLearningSession(w,value)&&(!path||(value as LearningSession).path===path);}
export function evaluateLearning(w:Workspace,s:LearningSession){const path=paths.find(p=>p.id===s?.path)??paths[0];const valid=validateLearningSession(w,s);let chain=true;const steps=path.steps.map(step=>{const c=valid?cp(s,step.id):undefined;const evidence=c&&historyMatches(w,c)?evidenceFor(w,s,c):null;const complete=chain&&!!evidence;chain=complete;return {step,complete,evidence:complete?evidence!:!valid?'教學紀錄與目前工作區不符，請開始新練習。':'尚未找到本次操作與工作區資料的完整證據。'};});const nextIndex=steps.findIndex(s=>!s.complete);return {path,steps,nextIndex:nextIndex<0?steps.length:nextIndex,complete:nextIndex<0};}
export function prepareLearningCommand(w:Workspace,s:LearningSession,stepId:string):LearningCommand|{blocked:string}{
 if(!validateLearningSession(w,s))return {blocked:'教學紀錄無效或工作區已更換，請開始新練習。'};const progress=evaluateLearning(w,s);if(progress.complete)return {blocked:'本次教學已完成，請開始另一輪練習。'};const step=progress.steps[progress.nextIndex].step;if(step.id!==stepId)return {blocked:'請先完成目前這一步，不會跳過前面的操作。'};
 const c=(id:string)=>cp(s,id);const business=w.wallets.find(v=>v.kind==='business');const buyer=row(w.wallets,c('buyer')?.result);const receive=c('receive');let payload:RecordData;
 const product=receive?row(w.products,receive.payload.product_id):w.products.find(p=>p.active&&Number.isSafeInteger(p.price_minor)&&p.price_minor>0);const bom=w.boms.find(b=>row(w.products,b.product_id)?.active&&b.components?.length===1&&row(w.products,b.components[0].product_id)?.active);
 const blocked=(text:string)=>({blocked:text}); const finish=(payload:RecordData):LearningCommand=>{let preview=step.change;const money=(n:number)=>`${(n/100).toLocaleString('zh-TW')} SIM`;
 if(stepId==='customer')preview='新增本次專用客戶，保留現有客戶資料。';
 else if(stepId==='buyer')preview='新增本次專用買家錢包，起始餘額為 0 SIM。';
 else if(actions[s.path][stepId]==='wallet.fund')preview=`${stepId==='fund-business'?'商家錢包':'本次買家錢包'}增加 ${money(payload.amount_minor)}，留下補幣流水。`;
 else if(stepId==='receive'){const p=row(w.products,payload.product_id);preview=`採購「${p?.name??'本次材料'}」${payload.quantity} 件，商家支付 ${money((p?.cost_minor??0)*payload.quantity)} 測試幣。`;}
 else if(stepId==='order')preview=`新增一筆「${product?.name??'本次商品'}」訂單，數量 1 件，售價 ${money(product?.price_minor??0)}。`;
 else if(stepId==='work-order'){const b=row(w.boms,payload.bom_id);preview=`新增「${row(w.products,b?.product_id)?.name??'本次成品'}」製作單，計畫製作 1 件；沿用 BOM 第 ${b?.revision??1} 版。`;}
 else if(stepId==='quote')preview='新增 1,000 SIM 模擬報價草稿，有效期限七天。';
 else if(stepId==='service')preview=`新增本次服務草稿，金額 ${money(payload.amount_minor)}，沿用本次案件。`;
 else if(stepId==='pay')preview=`本次買家支付 ${money(payload.amount_minor)} 測試幣，留下${s.path==='sales'?'訂單':'服務'}收款流水。`;
 return {action:actions[s.path][stepId],payload,preview};};
 if(stepId==='customer')return finish({name:ownName(s,'客戶')});if(stepId==='buyer')return finish({name:ownName(s,'買家'),kind:'buyer'});
 if(stepId==='fund-business'){if(!business)return blocked('商家錢包不存在，請檢查工作區。');const cost=s.path==='manufacturing'?(bom?row(w.products,bom.components[0].product_id)?.cost_minor*bom.components[0].quantity:NaN):product?.cost_minor;if(!Number.isSafeInteger(cost)||cost<0)return blocked('找不到可用商品或單元件 BOM，請先在對應模組建立。');return finish({wallet_id:business.id,amount_minor:Math.max(100,cost)});}
 if(stepId==='receive'){if(s.path==='manufacturing'){if(!bom)return blocked('找不到單元件且成品與材料皆啟用的 BOM；多元件請先在製造模組操作。');const material=row(w.products,bom.components[0].product_id)!;payload={product_id:material.id,quantity:bom.components[0].quantity};}else{if(!product?.active)return blocked('找不到啟用中的商品，請先建立商品。');payload={product_id:product.id,quantity:1};}const cost=row(w.products,payload.product_id)!.cost_minor*payload.quantity;if(!business||business.balance_minor<cost)return blocked('商家測試幣不足，請先明確補幣後回來。');return finish(payload);}
 if(stepId==='fund-buyer'){const amount=s.path==='sales'?product?.price_minor:row(w.services,c('service')?.result)?.amount_minor;if(!buyer||!Number.isSafeInteger(amount)||amount<=0)return blocked('本次買家或付款金額不存在。');return finish({wallet_id:buyer.id,amount_minor:amount});}
 if(s.path==='sales'){if(stepId==='order'){if(!buyer||!product?.active||product.on_hand-product.reserved<1)return blocked('本次買家或可用商品不足，請檢查工作區。');return finish({learning_run_id:s.runId,buyer_wallet_id:buyer.id,lines:[{product_id:product.id,quantity:1}]});}const o=row(w.orders,c('order')?.result);if(!o)return blocked('找不到本次教學訂單。');if(stepId==='pay'){if(o.paid_minor!==0||o.status!=='pending'||!buyer||buyer.balance_minor<o.total_minor)return blocked('本次訂單已變更或買家測試幣不足；請檢查後開始新練習。');return finish({id:o.id,amount_minor:o.total_minor});}if(stepId==='ship'){if(o.paid_minor!==o.total_minor||o.lines[0]?.shipped_quantity!==0)return blocked('本次訂單未付清或已出貨。');return finish({id:o.id,lines:[{line_id:o.lines[0].id,quantity:1}]});}}
 if(s.path==='manufacturing'){if(stepId==='work-order'){const selected=w.boms.find(b=>b.components?.length===1&&b.components[0].product_id===receive?.payload.product_id&&b.components[0].quantity===receive?.payload.quantity&&row(w.products,b.product_id)?.active);if(!selected)return blocked('找不到本次材料對應的 BOM。');return finish({learning_run_id:s.runId,bom_id:selected.id,quantity:1});}const o=row(w.workOrders,c('work-order')?.result);if(!o)return blocked('找不到本次製作單。');const expected:RecordData={reserve:'planned',start:'reserved',complete:'started'};if(o.status!==expected[stepId])return blocked('本次製作單狀態已變更，請檢查後開始新練習。');if(stepId==='reserve'&&o.bom_snapshot.components.some((c:RecordData)=>{const p=row(w.products,c.product_id);return !p||p.on_hand-p.reserved<c.quantity;}))return blocked('本次材料不足，請先檢查庫存。');return finish({id:o.id});}
 if(s.path==='service'){const caseId=c('case')?.result,q=row(w.quotes,c('quote')?.result),service=row(w.services,c('service')?.result);if(stepId==='case')return finish({title:ownName(s,'服務案件'),customer_id:c('customer')!.result,status:'open'});if(stepId==='quote')return finish({case_id:caseId,amount_minor:100000,expires_at:new Date(Date.now()+7*86400000).toISOString()});if(stepId==='issue'){if(q?.status!=='draft')return blocked('本次報價不是草稿。');return finish({id:q.id});}if(stepId==='confirm-quote'){if(q?.status!=='issued'||Date.parse(q.expires_at)<=Date.now())return blocked('本次報價已失效，請開始新練習。');return finish({id:q.id,digest:q.digest});}if(stepId==='service')return finish({case_id:caseId,amount_minor:q!.amount_minor});if(!service)return blocked('找不到本次服務。');if(stepId==='confirm-service'){if(service.status!=='draft')return blocked('本次服務不是草稿。');return finish({id:service.id});}if(stepId==='deliver'){if(service.status!=='confirmed')return blocked('本次服務尚未確認或已變更。');return finish({id:service.id,artifact_ref:ownName(s,'交付物')});}if(stepId==='accept'){const d=row(service.deliveries,service.latest_delivery_id);if(service.status!=='submitted'||!d||d.artifact_ref!==ownName(s,'交付物'))return blocked('本次最新交付已變更，請檢查服務。');return finish({id:service.id,delivery_id:d.id,digest:d.digest});}if(stepId==='pay'){if(service.status!=='accepted'||service.paid_minor!==0||!buyer||buyer.balance_minor<service.amount_minor)return blocked('本次服務尚未驗收、已收款或買家測試幣不足。');return finish({id:service.id,buyer_wallet_id:buyer.id,amount_minor:service.amount_minor});}}
 return blocked('這一步沒有可執行的教學指令。');
}
export function captureLearningCheckpoint(s:LearningSession,stepId:string,command:Pick<LearningCommand,'action'|'payload'>,result:string,updated:Workspace,receiptVersion:number=updated.version):LearningSession{
 const next:LearningSession={...s,checkpoints:[...s.checkpoints,{stepId,action:command.action,payload:structuredClone(command.payload),result,version:receiptVersion}]};if(!validateLearningSession(updated,next))throw new Error('教學操作紀錄不符，未保存進度。');const progress=evaluateLearning(updated,next);if(!progress.steps[next.checkpoints.length-1]?.complete)throw new Error('未找到這次教學操作的實際證據，未保存進度。');return next;
}
