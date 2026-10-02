import {randomUUID} from 'node:crypto';
import {digest} from './problem.js';
import {ok} from './problem.js';
export interface WorldData {products:any[];wallets:any[];orders:any[];services:any[];ledger:any[];purchases:any[]}
export function freshWorld():WorldData{return {products:[],wallets:['business','supplier','faucet'].map(kind=>({id:randomUUID(),kind,name:kind,balance_minor:0})),orders:[],services:[],ledger:[],purchases:[]};}
function find(items:any[],id:string){const value=items.find(v=>v.id===id);ok(value,404,'simulation_record_missing','找不到這個模擬世界的紀錄。');return value;}
function safe(n:number){ok(Number.isSafeInteger(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER,422,'simulation_amount_overflow','模擬數值超出範圍。');return n;}
function move(w:WorldData,from:any,to:any,amount:number,kind:string){safe(amount);ok(amount>=0,422,'simulation_amount_invalid','模擬金額不符。');ok(from.kind==='faucet'||from.balance_minor>=amount,409,'simulation_insufficient_funds','模擬錢包餘額不足。');from.balance_minor=safe(from.balance_minor-amount);to.balance_minor=safe(to.balance_minor+amount);const t={id:randomUUID(),kind,entries:[{wallet_id:from.id,amount_minor:-amount},{wallet_id:to.id,amount_minor:amount}]};w.ledger.push(t);return t.id;}
function selections(lines:any[],p:any[]){const seen=new Set();return p.map(x=>{ok(!seen.has(x.line_id),422,'simulation_duplicate_line','同一品項不能重複指定。');seen.add(x.line_id);return {line:find(lines,x.line_id),quantity:x.quantity};});}
export function apply(w:WorldData,action:string,p:any,source?:any):string {
 const business=w.wallets.find(v=>v.kind==='business'),supplier=w.wallets.find(v=>v.kind==='supplier');
 if(action==='product.create'){const v={id:randomUUID(),...p,active:true,on_hand:0,reserved:0,stock_value_minor:0,lots:[]};w.products.push(v);return v.id;}
 if(action==='product.update'){const v=find(w.products,p.id);Object.assign(v,p);return v.id;}
 if(action==='wallet.create'){const v={id:randomUUID(),...p,balance_minor:0};w.wallets.push(v);return v.id;}
 if(action==='wallet.fund'){const wallet=find(w.wallets,p.wallet_id);ok(['buyer','business'].includes(wallet.kind),422,'simulation_wallet_invalid','只能補充買家或商家的測試幣。');return move(w,w.wallets.find(v=>v.kind==='faucet'),wallet,p.amount_minor,action);}
 if(action==='inventory.receive'){const product=find(w.products,p.product_id);const cost=safe(product.cost_minor*p.quantity);move(w,business,supplier,cost,action);product.on_hand=safe(product.on_hand+p.quantity);product.stock_value_minor=safe(product.stock_value_minor+cost);product.lots.push({quantity:p.quantity,cost_minor:product.cost_minor});const purchase={id:randomUUID(),product_id:product.id,name:product.name,quantity:p.quantity,cost_minor:product.cost_minor,total_minor:cost};w.purchases.push(purchase);return purchase.id;}
 if(action==='order.create'){
  const buyer=find(w.wallets,p.buyer_wallet_id);ok(buyer.kind==='buyer',422,'simulation_buyer_required','請選擇模擬買家錢包。');const seen=new Set();
  const lines=p.lines.map((x:any)=>{ok(!seen.has(x.product_id),422,'simulation_duplicate_line','商品不可重複。');seen.add(x.product_id);const v=find(w.products,x.product_id);ok(v.active,409,'simulation_product_inactive','商品已停用。');ok(v.on_hand-v.reserved>=x.quantity,409,'simulation_out_of_stock','模擬庫存不足。');v.reserved+=x.quantity;return {id:randomUUID(),product_id:v.id,name:v.name,price_minor:v.price_minor,cost_minor:v.cost_minor,quantity:x.quantity,shipped_quantity:0,returned_quantity:0,shipped_cost_lots:[]};});
  const order={id:randomUUID(),...(p.learning_run_id?{learning_run_id:p.learning_run_id}:{}),buyer_wallet_id:buyer.id,status:'pending',total_minor:safe(lines.reduce((s:number,l:any)=>s+safe(l.price_minor*l.quantity),0)),paid_minor:0,refunded_minor:0,lines};w.orders.push(order);return order.id;
 }
 if(action.startsWith('order.')){
  const order=find(w.orders,p.id),buyer=find(w.wallets,order.buyer_wallet_id);ok(order.status!=='cancelled',409,'simulation_order_cancelled','訂單已取消。');
  if(action==='order.pay'){ok(!order.lines.some((l:any)=>l.shipped_quantity),409,'simulation_order_shipped','出貨後不能再付款。');ok(order.paid_minor+p.amount_minor<=order.total_minor,409,'simulation_overpayment','不能超過模擬訂單金額。');move(w,buyer,business,p.amount_minor,action);order.paid_minor+=p.amount_minor;order.status=order.paid_minor===order.total_minor?'paid':'partially_paid';}
  if(action==='order.cancel'){ok(!order.lines.some((l:any)=>l.shipped_quantity),409,'simulation_order_shipped','出貨後請使用退貨。');move(w,business,buyer,order.paid_minor,action);order.refunded_minor=order.paid_minor;for(const l of order.lines)find(w.products,l.product_id).reserved-=l.quantity;order.status='cancelled';}
  if(action==='order.ship'){ok(order.paid_minor===order.total_minor,409,'simulation_payment_required','全額模擬付款後才能出貨。');for(const {line:l,quantity:n} of selections(order.lines,p.lines)){ok(l.shipped_quantity+n<=l.quantity,409,'simulation_overship','不能超量出貨。');const product=find(w.products,l.product_id);ok(product.on_hand>=n&&product.reserved>=n,409,'simulation_out_of_stock','模擬庫存不足。');product.on_hand-=n;product.reserved-=n;let remaining=n;while(remaining>0){const lot=product.lots[0];ok(lot,409,'simulation_inventory_corrupt','模擬庫存成本層不足。');const take=Math.min(remaining,lot.quantity);l.shipped_cost_lots.push({quantity:take,cost_minor:lot.cost_minor,returned:0});product.stock_value_minor-=safe(take*lot.cost_minor);lot.quantity-=take;remaining-=take;if(!lot.quantity)product.lots.shift();}l.shipped_quantity+=n;}order.status=order.lines.every((l:any)=>l.shipped_quantity===l.quantity)?'shipped':'partially_shipped';}
  if(action==='order.return'){const selected=selections(order.lines,p.lines);let refund=0;for(const {line:l,quantity:n} of selected){ok(l.returned_quantity+n<=l.shipped_quantity,409,'simulation_overreturn','不能退超過已出貨數量。');refund=safe(refund+safe(l.price_minor*n));}ok(order.refunded_minor+refund<=order.paid_minor,409,'simulation_overrefund','不能超額退款。');move(w,business,buyer,refund,action);for(const {line:l,quantity:n} of selected){const product=find(w.products,l.product_id);product.on_hand+=n;let remaining=n;for(const lot of l.shipped_cost_lots){const take=Math.min(remaining,lot.quantity-lot.returned);if(take){product.lots.push({quantity:take,cost_minor:lot.cost_minor});product.stock_value_minor=safe(product.stock_value_minor+safe(lot.cost_minor*take));lot.returned+=take;remaining-=take;}if(!remaining)break;}ok(remaining===0,409,'simulation_inventory_corrupt','模擬退貨成本層不足。');l.returned_quantity+=n;}order.refunded_minor+=refund;order.status=order.lines.every((l:any)=>l.returned_quantity===l.quantity)?'returned':'partially_returned';}
  return order.id;
 }
 if(action==='service.create'){ok(source,404,'simulation_source_missing','找不到模擬服務來源。');const service={id:randomUUID(),case_id:p.case_id,title:source.case.title,source_snapshot:source,amount_minor:p.amount_minor,currency:'SIM',status:'draft',paid_minor:0,deliveries:[],latest_delivery_id:null,legal_confirmation:false};w.services.push(service);return service.id;}
 if(action.startsWith('service.')){
  const s=find(w.services,p.id);
  if(action==='service.confirm'){ok(s.status==='draft',409,'simulation_service_state','服務已模擬確認。');s.status='confirmed';}
  if(action==='service.deliver'){ok(['confirmed','submitted','changes_requested','accepted'].includes(s.status),409,'simulation_service_state','請先模擬確認服務。');ok(s.paid_minor===0,409,'simulation_service_paid','已收模擬款的服務不可改交付。');const d={id:randomUUID(),revision:s.deliveries.length+1,artifact_ref:p.artifact_ref,digest:digest({service_id:s.id,revision:s.deliveries.length+1,artifact_ref:p.artifact_ref})};s.deliveries.push(d);s.latest_delivery_id=d.id;s.status='submitted';}
  if(['service.accept','service.request_changes'].includes(action)){const d=find(s.deliveries,p.delivery_id);ok(s.status==='submitted'&&s.latest_delivery_id===d.id&&d.digest===p.digest,409,'simulation_delivery_outdated','只能處理最新交付與正確摘要。');s.status=action==='service.accept'?'accepted':'changes_requested';}
  if(action==='service.pay'){ok(s.status==='accepted',409,'simulation_acceptance_required','模擬驗收後才能付款。');const buyer=find(w.wallets,p.buyer_wallet_id);ok(buyer.kind==='buyer',422,'simulation_buyer_required','請選擇模擬買家。');ok(s.paid_minor+p.amount_minor<=s.amount_minor,409,'simulation_overpayment','不能超收模擬服務款。');move(w,buyer,business,p.amount_minor,action);s.paid_minor+=p.amount_minor;}
  return s.id;
 }
 throw new Error('Unhandled simulation action');
}
export function report(w:WorldData){
 let sales=0,refunds=0,cost=0,estimatedCost=0;
 for(const o of w.orders)for(const l of o.lines){
  sales=safe(sales+safe(l.price_minor*l.shipped_quantity));
  refunds=safe(refunds+safe(l.price_minor*l.returned_quantity));
  // Catalog cost remains the immutable planning snapshot. Actual simulation
  // COGS follows the same purchased FIFO lots consumed by shipping and restored
  // by returns, so profit and inventory valuation reconcile after cost changes.
  estimatedCost=safe(estimatedCost+safe(l.cost_minor*(l.shipped_quantity-l.returned_quantity)));
  for(const lot of l.shipped_cost_lots)cost=safe(cost+safe(lot.cost_minor*(lot.quantity-lot.returned)));
 }
 return {sales_minor:sales,refunds_minor:refunds,cost_of_goods_sold_minor:cost,gross_profit_minor:safe(sales-refunds-cost),estimated_gross_profit_minor:safe(sales-refunds-estimatedCost),gross_profit_basis:'actual_simulation_fifo' as const,inventory_value_minor:safe(w.products.reduce((s,v)=>s+v.stock_value_minor,0)),service_payments_minor:safe(w.services.reduce((s,v)=>s+v.paid_minor,0))};
}
