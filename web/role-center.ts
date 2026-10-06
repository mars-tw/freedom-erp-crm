import type {RecordData,Workspace} from './api';
import {indexWorkspace,type RecordKind,type WorkspaceTarget} from './workbench-model';

export type RoleView = 'owner'|'sales'|'operations'|'administration';
export const roleViews:{id:RoleView;name:string;description:string}[] = [
  {id:'owner',name:'店長／負責人',description:'掌握待辦與營運模擬流程'},
  {id:'sales',name:'業務與服務',description:'跟進客戶、訂單與交付'},
  {id:'operations',name:'庫存與製造',description:'核對商品、材料與製作單'},
  {id:'administration',name:'行政與排班',description:'處理班表與模擬行政申請'},
];
export interface RoleCard {id:string;label:string;count:number;unit:string;description:string;module:string;target?:WorkspaceTarget}
export interface RoleFlow {id:string;title:string;description:string;steps:{module:string;label:string}[]}
export interface RoleCenterModel {view:RoleView;cards:RoleCard[];flow:RoleFlow|null}
export function availableRoleViews(workspace:Workspace):RoleView[] {
  const has = (ids:string[]) => ids.some(id => workspace.modules.includes(id));
  return roleViews.filter(view => view.id === 'owner' || view.id === 'sales' && has(['crm','sales','services']) || view.id === 'operations' && has(['inventory','manufacturing']) || view.id === 'administration' && has(['administration'])).map(view => view.id);
}

const memory = new Map<string,RoleView>(), volatile = new Set<string>();
function preferenceKey(generation:string):string|null {return typeof generation === 'string' && generation.length > 0 && generation.length <= 100 && !/[\u0000-\u001f\u007f-\u009f]/.test(generation) ? 'freedom-erp.role-view.v1.' + encodeURIComponent(generation) : null;}
function isRoleView(value:unknown):value is RoleView {return typeof value === 'string' && roleViews.some(role => role.id === value);}
function allowed(workspace:Workspace,value:unknown):RoleView {return isRoleView(value) && availableRoleViews(workspace).includes(value) ? value : 'owner';}
export function readRoleView(workspace:Workspace):RoleView {
  const key = preferenceKey(workspace.generation_id); if (!key) return 'owner';
  if (volatile.has(key)) return allowed(workspace,memory.get(key));
  try {
    const raw = sessionStorage.getItem(key); if (!raw || raw.length > 120) return 'owner';
    const value:unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value,'version') || !Object.hasOwn(value,'view')) return 'owner';
    const record = value as {version:unknown;view:unknown};
    return record.version === 1 ? allowed(workspace,record.view) : 'owner';
  } catch {return allowed(workspace,memory.get(key));}
}
export function writeRoleView(workspace:Workspace,view:RoleView):boolean {
  const key = preferenceKey(workspace.generation_id); if (!key || !isRoleView(view) || !availableRoleViews(workspace).includes(view)) return false;
  memory.set(key,view);
  if (memory.size > 64) {const oldest = memory.keys().next().value; if (oldest) {memory.delete(oldest); volatile.delete(oldest);}}
  try {sessionStorage.setItem(key,JSON.stringify({version:1,view})); volatile.delete(key); return true;}
  catch {volatile.add(key); return false;}
}

export function roleCenterModel(workspace:Workspace,requested:RoleView):RoleCenterModel {
  const view = allowed(workspace,requested), has = (module:string) => workspace.modules.includes(module);
  const records = indexWorkspace(workspace);
  const openOrders = workspace.orders.filter(row => !['cancelled','returned'].includes(row.status) && (row.paid_minor < row.total_minor || (row.lines || []).some((line:RecordData) => line.shipped_quantity < line.quantity)));
  const openServices = workspace.services.filter(row => ['draft','confirmed','changes_requested','submitted'].includes(row.status) || row.status === 'accepted' && row.paid_minor < row.amount_minor);
  const emptyStock = workspace.products.filter(row => row.active === true && row.on_hand - row.reserved <= 0);
  const openWorkOrders = workspace.workOrders.filter(row => ['planned','reserved','started'].includes(row.status));
  const openDeals = workspace.deals.filter(row => ['new','open'].includes(row.status));
  const openTasks = workspace.tasks.filter(row => ['todo','in_progress'].includes(row.status));
  const office = workspace.administration;
  const cards:RoleCard[] = [];
  const add = (id:string,label:string,module:string,rows:RecordData[],description:string,kind?:RecordKind,unit='筆') => {
    if (!has(module)) return;
    const ids = new Set(rows.map(row => row.id));
    const target = kind ? records.find(record => record.target.module === module && record.target.kind === kind && ids.has(record.target.id))?.target : undefined;
    cards.push({id,label,module,count:rows.length,unit,description,...(target ? {target} : {})});
  };
  const orders = () => add('open-orders','待處理訂單','sales',openOrders,'尚有未付測試幣或未出貨品項。','order');
  const services = () => add('open-services','待處理服務','services',openServices,'查看草稿、交付、驗收與未收足測試幣的服務。','service');
  const stock = () => add('empty-stock','無可用庫存商品','inventory',emptyStock,'啟用商品的現有數量減預留數量為 0；目前未設定安全庫存門檻。','product','項');
  const production = () => add('open-work-orders','進行中製作單','manufacturing',openWorkOrders,'計畫中、已備料或製作中，尚未完工。','workOrder');
  const requests = () => add('admin-requests','待處理模擬申請','administration',office?.requests.filter(row => row.status === 'submitted') || [],'只計算已送出的模擬申請，不代表正式核准。');
  const tasks = () => add('open-tasks','進行中任務','projects',openTasks,'查看待辦與進行中的任務。','task');
  const deals = () => add('open-deals','待跟進商機','crm',openDeals,'查看待聯繫與進行中的商機。','deal');
  if (view === 'administration') {
    requests();
    add('scheduled-shifts','已排班次','administration',office?.shifts.filter(row => row.status === 'scheduled') || [],'狀態仍為已排班；排班不代表已完成出勤。',undefined,'班');
    add('active-staff','模擬在職人員','administration',office?.staff.filter(row => row.status === 'active') || [],'使用假名與模擬資料，尚未提供正式薪資。',undefined,'人');
    add('active-reservations','有效設備預約','administration',office?.reservations.filter(row => row.status === 'reserved') || [],'查看未取消或歸還的設備預約。');
  } else if (view === 'operations') {stock(); production(); orders(); tasks();}
  else if (view === 'sales') {orders(); services(); deals(); tasks();}
  else {orders(); services(); stock(); production(); requests(); tasks(); deals();}
  if (!cards.length && has('wallets')) add('ledger-records','模擬流水紀錄','wallets',workspace.ledger,'查看已發生的 SIM 測試幣紀錄，不是正式會計帳。');
  const flow = chooseFlow(workspace,view);
  return {view,cards:cards.slice(0,4),flow};
}

function chooseFlow(workspace:Workspace,view:RoleView):RoleFlow|null {
  const has = (module:string) => workspace.modules.includes(module);
  const make = (id:string,title:string,description:string,steps:{module:string;label:string}[]):RoleFlow => ({id,title,description,steps:steps.filter(step => step.module === 'reports' || has(step.module))});
  if (view === 'administration' && has('administration')) return make('admin','行政日常','整理模擬人員、排班與申請，操作時再逐筆確認。',[{module:'administration',label:'開啟行政工作台'}]);
  if ((view === 'operations' || workspace.industry === 'manufacturing' && view === 'owner') && has('manufacturing')) return make('production','從材料到完工','依序核對材料、製作與成本報表。點擊只會開啟頁面。',[{module:'inventory',label:'核對材料庫存'},{module:'manufacturing',label:'查看配方與製作單'},{module:'reports',label:'核對模擬報表'}]);
  if (view !== 'operations' && has('services') && (!has('sales') || ['service','projects'].includes(workspace.industry))) return make('service','從客戶到服務收款','整理客戶需求，再確認交付與 SIM 測試幣紀錄。',[{module:'crm',label:'整理客戶與案件'},{module:'services',label:'查看報價與交付'},{module:'wallets',label:'核對測試幣錢包'},{module:'reports',label:'核對模擬報表'}]);
  if (view !== 'operations' && has('sales')) return make('sales','從備貨到接單出貨','先備妥商品與測試幣，再到訂單頁確認操作。',[{module:'inventory',label:'準備商品與庫存'},{module:'wallets',label:'準備測試幣'},{module:'sales',label:'查看訂單與出貨'},{module:'reports',label:'核對模擬報表'}]);
  if (has('inventory')) return make('inventory','商品與存貨整理','先查看商品與可用數量，再核對模擬成本紀錄。',[{module:'inventory',label:'整理商品與庫存'},{module:'reports',label:'核對模擬報表'}]);
  if (has('administration')) return make('admin','行政日常','從模擬人員、班表與行政申請開始。',[{module:'administration',label:'開啟行政工作台'}]);
  if (has('projects')) return make('projects','安排今天的工作','整理待辦與交付進度，再逐筆更新紀錄。',[{module:'projects',label:'查看任務與里程碑'}]);
  if (has('crm')) return make('crm','客戶與商機整理','整理客戶與商機，再決定下一個跟進動作。',[{module:'crm',label:'查看客戶與商機'}]);
  if (has('wallets')) return make('wallets','核對 SIM 測試幣','查看錢包與已發生的模擬流水。',[{module:'wallets',label:'查看測試幣錢包'},{module:'reports',label:'核對模擬報表'}]);
  return null;
}
