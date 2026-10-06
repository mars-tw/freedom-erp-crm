import type {Workspace} from './api';

export type StarterRoute={module:string;title:string;description:string;action:string};
/** Route only to enabled modules. Sample records never count as user work. */
export function starterRoute(workspace:Workspace):StarterRoute{
 const modules=workspace.modules;
 if(modules.includes('inventory'))return {module:'inventory',title:'把商品換成你的店務範例',description:'查看示範商品，編輯名稱與模擬售價；要接單時，再準備庫存與測試幣。',action:'查看我的商品'};
 if(modules.includes('services'))return {module:'services',title:'從第一項服務開始',description:'查看示範服務，確認報價、交付與驗收的操作條件。',action:'查看我的服務'};
 if(modules.includes('crm'))return {module:'crm',title:'建立第一位模擬客戶',description:'新增虛構客戶，記下需求，再安排下一次跟進。',action:'前往客戶管理'};
 if(modules.includes('administration'))return {module:'administration',title:'安排第一個班次',description:'從組織與假員工開始，依畫面引導排班；也可明確加入合成示範。',action:'前往行政工作台'};
 if(modules.includes('projects'))return {module:'projects',title:'安排第一件待辦',description:'新增工作名稱、到期時間與說明，完成後更新狀態。',action:'前往任務管理'};
 return {module:'wallets',title:'認識測試幣錢包',description:'查看商家與買家錢包。補充 SIM 測試幣會在你確認後才執行。',action:'查看測試幣錢包'};
}
export function starterEvidence(workspace:Workspace){
 const actions=new Set<string>((workspace.history||[]).map((row:{action:string})=>row.action));
 const records=[...actions].some(action=>/^(product|wallet|customer|contact|case|deal|task|milestone|bom|office\.(unit|staff|shift|attendance|request|equipment|reservation|notice))\.(create|update)$/.test(action));
 const operation=[...actions].some(action=>['order.ship','service.pay','workOrder.complete','followup.create','office.attendance.create','office.request.prepare','inventory.receive'].includes(action))||workspace.tasks.some(row=>row.status==='done')||workspace.milestones.some(row=>row.status==='done')||(workspace.modules.includes('wallets')&&actions.has('wallet.fund'))||(workspace.modules.includes('inventory')&&!workspace.modules.some(module=>['sales','manufacturing','services'].includes(module))&&actions.has('product.update'));
 return {records,operation};
}
const memory=new Map<string,boolean>();
const volatile=new Set<string>();
function keyFor(id:string){return typeof id==='string'&&id.length>0&&id.length<=100?'first-run-guide.v1.'+encodeURIComponent(id):null;}
export function readGuideHidden(id:string):boolean{
 const key=keyFor(id);if(!key)return false;
 if(volatile.has(key))return memory.get(key)||false;
 try{const raw=sessionStorage.getItem(key);if(!raw||raw.length>100)return false;const value=JSON.parse(raw);return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===2&&value.version===1&&value.hidden===true;}catch{return memory.get(key)||false;}
}
export function writeGuideHidden(id:string,hidden:boolean):boolean{
 const key=keyFor(id);if(!key||typeof hidden!=='boolean')return false;
 memory.set(key,hidden);
 if(memory.size>64){const oldest=memory.keys().next().value;if(oldest){memory.delete(oldest);volatile.delete(oldest);}}
 try{sessionStorage.setItem(key,JSON.stringify({version:1,hidden}));volatile.delete(key);return true;}catch{volatile.add(key);return false;}
}
