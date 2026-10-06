import {test,expect,type Page} from '@playwright/test';

const nav=(page:Page)=>page.getByRole('navigation',{name:'工作模組',exact:true});
async function view(page:Page){const response=await page.request.get('/api/workspace/view');expect(response.status()).toBe(200);return response.json();}
function watchWrites(page:Page){const writes:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/'))writes.push(new URL(request.url()).pathname);});return writes;}
async function preserved(page:Page,before:any,writes:string[]){const after=await view(page);expect(after.workspace).toEqual(before.workspace);expect(after.version).toBe(before.version);expect(writes).toEqual([]);}
async function setup(page:Page,only?:string[]){
 await page.goto('/#custom');if(process.env.EXPECTED_PUBLIC_ASSET)await expect(page.locator('script[src]')).toHaveAttribute('src','/assets/'+process.env.EXPECTED_PUBLIC_ASSET);
 await page.getByLabel('店名／工作室名稱',{exact:true}).fill('合成：角色與能力地圖驗收');await page.getByRole('button',{name:/^一般企業/}).click();
 if(only){const labels:Record<string,string>={inventory:'商品庫存',sales:'模擬訂單',wallets:'測試幣流水',services:'報價與服務',crm:'客戶與商機',projects:'任務與里程碑',manufacturing:'BOM 與製造',administration:'行政工作台'};for(const [id,label]of Object.entries(labels))if(!only.includes(id))await page.getByRole('checkbox',{name:label,exact:true}).uncheck();for(const id of only)await page.getByRole('checkbox',{name:labels[id],exact:true}).check();}
 await page.getByRole('button',{name:'建立我的測試系統',exact:true}).click();await expect(page.getByRole('heading',{name:'合成：角色與能力地圖驗收',exact:true})).toBeVisible();await expect(page.getByTestId('role-center')).toBeVisible();
}
async function openMap(page:Page){await page.getByTestId('role-open-capabilities').click();await expect(page.getByTestId('capability-map')).toBeVisible();await expect(page).toHaveURL(/#capabilities$/);}
async function count(page:Page,id:string,value:number,unit='筆'){await expect(page.getByTestId('role-card-'+id).locator('strong').first()).toHaveText(String(value)+unit);}

test('all four work views show bounded real-state cards and preserve their preference without business writes',async({page})=>{
 await setup(page);const stable=await view(page),writes=watchWrites(page),world=stable.workspace;
 const unpaid=world.orders.filter((row:any)=>!['cancelled','returned'].includes(row.status)&&(row.paid_minor<row.total_minor||row.lines.some((line:any)=>line.shipped_quantity<line.quantity))).length;
 const services=world.services.filter((row:any)=>['draft','confirmed','changes_requested','submitted'].includes(row.status)||(row.status==='accepted'&&row.paid_minor<row.amount_minor)).length;
 const emptyStock=world.products.filter((row:any)=>row.active&&row.on_hand-row.reserved<=0).length;
 for(const role of ['owner','sales','operations','administration']){
  await page.getByTestId('role-view-'+role).click();await expect(page.getByTestId('role-view-'+role)).toHaveAttribute('aria-pressed','true');
  const cards=page.getByTestId('role-center').locator('[data-testid^="role-card-"]');expect(await cards.count()).toBeGreaterThan(0);expect(await cards.count()).toBeLessThanOrEqual(4);
  if(role==='owner'){await count(page,'open-orders',unpaid);await count(page,'open-services',services);await count(page,'empty-stock',emptyStock,'項');}
  if(role==='sales'){await count(page,'open-orders',unpaid);await count(page,'open-services',services);await count(page,'open-deals',world.deals.filter((row:any)=>['new','open'].includes(row.status)).length);await count(page,'open-tasks',world.tasks.filter((row:any)=>['todo','in_progress'].includes(row.status)).length);}
  if(role==='operations'){await count(page,'empty-stock',emptyStock,'項');await count(page,'open-work-orders',world.workOrders.filter((row:any)=>['planned','reserved','started'].includes(row.status)).length);await count(page,'open-orders',unpaid);}
  if(role==='administration'){await count(page,'admin-requests',world.administration.requests.filter((row:any)=>row.status==='submitted').length);await count(page,'scheduled-shifts',world.administration.shifts.filter((row:any)=>row.status==='scheduled').length,'班');await count(page,'active-staff',world.administration.staff.filter((row:any)=>row.status==='active').length,'人');await count(page,'active-reservations',world.administration.reservations.filter((row:any)=>row.status==='reserved').length);}
 }
 await page.reload();await expect(page.getByTestId('role-view-administration')).toHaveAttribute('aria-pressed','true');
 await expect(page.getByTestId('role-center')).toContainText('不會改變功能或帳號權限');await preserved(page,stable,writes);
});

test('a real confirmed service appears in the count and card drilldown focuses an actual open record without executing another command',async({page})=>{
 await setup(page);await nav(page).getByRole('button',{name:'報價與服務',exact:true}).click();await page.getByRole('button',{name:'建立服務',exact:true}).click();
 const dialog=page.getByRole('dialog'),before=await view(page);await dialog.getByRole('combobox',{name:/案件/}).selectOption(before.workspace.cases[0].id);await dialog.getByRole('spinbutton').fill('12345');
 await dialog.getByRole('button',{name:'確認模擬操作',exact:true}).click();await expect(dialog).toHaveCount(0);const stable=await view(page);expect(stable.version).toBe(before.version+1);expect(stable.workspace.services).toHaveLength(before.workspace.services.length+1);
 expect(stable.workspace.ledger).toEqual(before.workspace.ledger);const writes=watchWrites(page);await nav(page).getByRole('button',{name:'工作總覽',exact:true}).click();await page.getByTestId('role-view-sales').click();
 const open=stable.workspace.services.filter((row:any)=>['draft','confirmed','changes_requested','submitted'].includes(row.status)||(row.status==='accepted'&&row.paid_minor<row.amount_minor));await count(page,'open-services',open.length);
 await page.getByTestId('role-card-open-services').click();await expect(nav(page).getByRole('button',{name:'報價與服務',exact:true})).toHaveClass(/active/);
 const record=page.getByTestId('records-service').locator('article[data-record-id="'+open[0].id+'"]');await expect(record).toBeFocused();await expect(record).toHaveClass(/target/);await expect(record).toBeInViewport();await preserved(page,stable,writes);
});

test('disabled modules cannot be reached through an unavailable role or invented flow step',async({page})=>{
 await setup(page,['crm']);const stable=await view(page),writes=watchWrites(page);expect(stable.workspace.modules).toEqual(['crm']);
 await expect(page.getByTestId('role-view-owner')).toBeEnabled();await expect(page.getByTestId('role-view-sales')).toBeEnabled();await expect(page.getByTestId('role-view-operations')).toBeDisabled();await expect(page.getByTestId('role-view-administration')).toBeDisabled();
 await page.getByTestId('role-view-sales').click();await expect(page.getByTestId('role-card-open-deals')).toBeVisible();
 for(const id of ['empty-stock','open-orders','open-services','open-work-orders','admin-requests','scheduled-shifts'])await expect(page.getByTestId('role-card-'+id)).toHaveCount(0);
 await expect(page.getByTestId('role-flow-crm')).toBeVisible();await expect(page.getByTestId('role-flow-crm').getByRole('button')).toHaveCount(1);
 await page.getByTestId('role-flow-step-crm-crm').click();await expect(nav(page).getByRole('button',{name:'客戶與商機',exact:true})).toHaveClass(/active/);
 await nav(page).getByRole('button',{name:'工作總覽',exact:true}).click();await preserved(page,stable,writes);
});

test('a fresh visitor can inspect the capability map and its honest planned scope before creating data',async({page})=>{
 const writes=watchWrites(page);await page.goto('/#capabilities');await expect(page.getByTestId('capability-map')).toBeVisible();await expect(page).toHaveURL(/#capabilities$/);const stable=await view(page);expect(stable.workspace).toBeNull();
 await expect(page.getByTestId('capability-map').locator('article[data-testid^="capability-CAP"]')).toHaveCount(34);
 for(const id of ['CAP05','CAP07','CAP08','CAP09','CAP25','CAP30']){await expect(page.getByTestId('capability-'+id)).toHaveClass(/is-planned/);await expect(page.getByTestId('capability-open-'+id)).toHaveCount(0);await expect(page.getByTestId('capability-plan-'+id)).toHaveAttribute('href','/enterprise-plan.html');}
 await expect(page.getByTestId('capability-CAP05')).toContainText('SIM 流水不能取代總帳');
 await page.getByTestId('capability-plan-CAP05').click();await expect(page).toHaveURL(/\/enterprise-plan(?:\.html)?$/);await page.goto('/#capabilities');await expect(page.getByTestId('capability-map')).toBeVisible();
 await page.getByTestId('capability-open-CAP14').click();await expect(page.getByTestId('build-center')).toBeVisible();await expect(page).toHaveURL(/#build$/);await preserved(page,stable,writes);
});

test('literal query, domain, status and summary filters show the capability contract without changing the workspace',async({page})=>{
 await setup(page);const stable=await view(page),writes=watchWrites(page);await openMap(page);
 const cards=page.getByTestId('capability-map').locator('article[data-testid^="capability-CAP"]');await expect(cards).toHaveCount(34);
 const totals=[];for(const status of ['ready','partial','planned'])totals.push(Number(await page.getByTestId('capability-summary-'+status).locator('strong').innerText()));expect(totals.reduce((sum,value)=>sum+value,0)).toBe(34);
 await page.getByTestId('capability-search').fill('發票');await expect(page.getByTestId('capability-CAP09')).toBeVisible();
 await page.getByTestId('capability-search').fill('.*[]');await expect(cards).toHaveCount(0);await expect(page.getByText('找不到符合的功能',{exact:true})).toBeVisible();
 await page.getByTestId('capability-reset').click();await expect(page.getByTestId('capability-search')).toBeFocused();await expect(cards).toHaveCount(34);
 await page.getByTestId('capability-group').selectOption({label:'採購與庫存'});await page.getByTestId('capability-status').selectOption('ready');await page.getByTestId('capability-search').fill('FIFO');await expect(cards).toHaveCount(1);await expect(page.getByTestId('capability-CAP17')).toBeVisible();
 await page.getByTestId('capability-reset').click();await page.getByTestId('capability-summary-planned').click();await expect(cards).toHaveCount(totals[2]);await expect(page.getByTestId('capability-summary-planned')).toHaveAttribute('aria-pressed','true');await expect(cards.locator('[data-testid^="capability-open-"]')).toHaveCount(0);
 await page.getByTestId('capability-summary-planned').click();await expect(cards).toHaveCount(34);
 await page.getByTestId('capability-open-CAP17').click();await expect(page.getByRole('heading',{name:'商品與庫存',exact:true})).toBeVisible();await preserved(page,stable,writes);
});

test('a capability with missing dependencies opens an alternative plan and retains the original company',async({page})=>{
 await setup(page,['crm']);const stable=await view(page),writes=watchWrites(page);await openMap(page);await expect(page.getByTestId('capability-open-CAP14')).toHaveText(/檢視另一套建置計畫/);await page.getByTestId('capability-open-CAP14').click();
 await expect(page.getByTestId('build-center')).toBeVisible();await page.getByTestId('build-company').fill('合成：另一套訂單規劃');await page.getByTestId('build-template-retail').click();await page.getByTestId('build-next').click();await page.getByTestId('build-next').click();
 await expect(page.getByTestId('build-existing')).toContainText('合成：角色與能力地圖驗收');await expect(page.getByTestId('build-create')).toHaveCount(0);await page.getByTestId('build-existing-open').click();
 await expect(page.getByRole('heading',{name:'合成：角色與能力地圖驗收',exact:true})).toBeVisible();await preserved(page,stable,writes);
});

test('blocked preference storage still permits current-tab role selection and navigation with no business writes',async({page})=>{
 await setup(page);const stable=await view(page),writes=watchWrites(page);
 await page.evaluate(()=>{const original=Storage.prototype.setItem;(window as any).__roleStorageSetter=original;Storage.prototype.setItem=function(key:string,value:string){if(key.startsWith('freedom-erp.role-view.v1.'))throw new DOMException('blocked','QuotaExceededError');return original.call(this,key,value);};});
 try{
  await page.getByTestId('role-view-operations').click();await expect(page.getByTestId('role-view-operations')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('role-flow-step-production-inventory').click();await expect(page.getByRole('heading',{name:'商品與庫存',exact:true})).toBeVisible();await nav(page).getByRole('button',{name:'工作總覽',exact:true}).click();await expect(page.getByTestId('role-view-operations')).toHaveAttribute('aria-pressed','true');
  await page.getByTestId('role-view-administration').click();await expect(page.getByTestId('role-view-administration')).toHaveAttribute('aria-pressed','true');await preserved(page,stable,writes);
 }finally{await page.evaluate(()=>{Storage.prototype.setItem=(window as any).__roleStorageSetter;});}
});

test('320px keyboard role selection and capability search fit in reduced motion without executing operations',async({page})=>{
 await page.setViewportSize({width:320,height:850});await page.emulateMedia({reducedMotion:'reduce'});await setup(page);const stable=await view(page),writes=watchWrites(page);
 for(const role of ['owner','sales','operations','administration']){const button=page.getByTestId('role-view-'+role);expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);await button.focus();await page.keyboard.press('Enter');await expect(button).toHaveAttribute('aria-pressed','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await page.screenshot({path:test.info().outputPath('role-center-mobile-320.png'),fullPage:true});await page.getByTestId('role-open-capabilities').focus();await page.keyboard.press('Enter');await expect(page.getByTestId('capability-map')).toBeVisible();
 await page.getByTestId('capability-search').focus();await page.keyboard.type('CAP09');await expect(page.getByTestId('capability-CAP09')).toBeVisible();await expect(page.getByTestId('capability-open-CAP09')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByTestId('capability-reset').focus();await page.keyboard.press('Enter');await expect(page.getByTestId('capability-search')).toBeFocused();expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
 await page.screenshot({path:test.info().outputPath('capability-map-mobile-320.png'),fullPage:true});await page.getByTestId('capability-back').click();await expect(page.getByTestId('role-view-administration')).toHaveAttribute('aria-pressed','true');await preserved(page,stable,writes);
});
