import {test,expect,type Page} from '@playwright/test';
type Path='sales'|'service'|'manufacturing';
async function view(page:Page){const response=await page.request.get('/api/workspace/view');expect(response.status()).toBe(200);return response.json();}
async function setup(page:Page,industry='一般企業',name='合成：教學工作區'){
 await page.goto('/');if(process.env.EXPECTED_PUBLIC_ASSET)await expect(page.locator('script[src]')).toHaveAttribute('src','/assets/'+process.env.EXPECTED_PUBLIC_ASSET);await page.getByLabel('店名／工作室名稱',{exact:true}).fill(name);await page.getByRole('button',{name:new RegExp('^'+industry)}).click();await page.getByRole('button',{name:'建立我的測試系統',exact:true}).click();await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
}
async function enter(page:Page,path:Path){await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'沉浸教學',exact:true}).click();await expect(page.getByTestId('learning-studio')).toBeVisible();await page.getByTestId('learning-route-'+path).click();await expect(page.getByTestId('learning-progress')).toBeVisible();}
async function execute(page:Page){const before=await view(page);await page.getByTestId('learning-execute').click();await expect.poll(async()=>(await view(page)).version).toBe(before.version+1);await expect(page.getByTestId('learning-evidence')).not.toContainText('尚無本次操作證據');await page.getByRole('button',{name:'前往下一個實作步驟',exact:true}).click();await expect(page.getByTestId('learning-execute')).toBeEnabled();}
async function complete(page:Page){
 // The UI decides which operation is next. Tests never fabricate lesson state
 // or send domain mutation fixtures in place of the teaching controls.
 for(let n=0;n<30;n++){
  if(await page.getByTestId('learning-complete').isVisible())return;
  const before=await view(page);await expect(page.getByTestId('learning-execute')).toBeEnabled();await page.getByTestId('learning-execute').click();await expect.poll(async()=>(await view(page)).version).toBe(before.version+1);
  await expect(page.getByTestId('learning-evidence')).not.toContainText('尚無本次操作證據');
  if(await page.getByTestId('learning-complete').isVisible())return;
  await page.getByRole('button',{name:'前往下一個實作步驟',exact:true}).click();await expect(page.getByTestId('learning-execute')).toBeEnabled();
 }
 throw new Error('Teaching route did not finish within 30 actual UI operations');
}
function moneyAndSafety(w:any){expect(w.currency).toBe('SIM');expect(w.simulation).toBe(true);expect(w.real_finance).toBe(false);expect(w.wallets.reduce((sum:number,v:any)=>sum+v.balance_minor,0)).toBe(0);for(const t of w.ledger)expect(t.entries.reduce((sum:number,v:any)=>sum+v.amount_minor,0)).toBe(0);}

for(const path of ['sales','service','manufacturing'] as Path[])test(`immersive ${path} teaching controls complete the real workflow with new dedicated records`,async({page})=>{
 await setup(page,'一般企業','合成：'+path+'教學');const baseline=(await view(page)).workspace;await enter(page,path);await complete(page);await page.getByTestId('learning-evidence').locator('summary').click();await expect(page.getByTestId('learning-evidence').locator('code')).toBeVisible();const w=(await view(page)).workspace;moneyAndSafety(w);
 if(path==='sales'){
  const orders=w.orders.filter((v:any)=>!baseline.orders.some((old:any)=>old.id===v.id));expect(orders).toHaveLength(1);const order=orders[0];expect(order.status).toBe('shipped');expect(order.learning_run_id).toMatch(/^[A-Za-z0-9_-]{8,80}$/);expect(order.paid_minor).toBe(order.total_minor);expect(order.total_minor).toBeGreaterThan(0);expect(order.lines.every((l:any)=>l.shipped_quantity===l.quantity)).toBe(true);expect(w.wallets.find((buyer:any)=>buyer.id===order.buyer_wallet_id).name).toBe('教學買家 '+order.learning_run_id);expect(w.customers.filter((c:any)=>!baseline.customers.some((old:any)=>old.id===c.id)).map((c:any)=>c.name)).toEqual([expect.stringMatching(/^教學客戶 /)]);await expect(page.getByTestId('learning-evidence')).toContainText(order.id);
 }else if(path==='service'){
  const services=w.services.filter((v:any)=>!baseline.services.some((old:any)=>old.id===v.id));expect(services).toHaveLength(1);const service=services[0];expect(service.status).toBe('accepted');expect(service.paid_minor).toBe(service.amount_minor);expect(service.paid_minor).toBeGreaterThan(0);expect(service.legal_confirmation).toBe(false);expect(service.latest_delivery_id).toBe(service.deliveries.at(-1).id);expect(!baseline.cases.some((v:any)=>v.id===service.case_id)).toBe(true);await expect(page.getByTestId('learning-evidence')).toContainText(service.id);
 }else{
  const workOrders=w.workOrders.filter((v:any)=>!baseline.workOrders.some((old:any)=>old.id===v.id));expect(workOrders).toHaveLength(1);const order=workOrders[0];expect(order.status).toBe('completed');expect(order.learning_run_id).toMatch(/^[A-Za-z0-9_-]{8,80}$/);expect(order.actual_cost_minor).toBeGreaterThan(0);const finished=w.products.find((v:any)=>v.id===order.bom_snapshot.product_id);expect(finished.on_hand).toBe(baseline.products.find((p:any)=>p.id===finished.id).on_hand+order.quantity);expect(finished.stock_value_minor).toBe(baseline.products.find((p:any)=>p.id===finished.id).stock_value_minor+order.actual_cost_minor);expect(finished.reserved).toBe(0);await expect(page.getByTestId('learning-evidence')).toContainText(order.id);
 }
 await page.screenshot({path:`test-results/learning-${path}-desktop.png`,fullPage:true});
 await page.reload();await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'沉浸教學',exact:true}).click();await expect(page.getByTestId('learning-complete')).toBeVisible();expect((await view(page)).workspace).toEqual(w);
});

test('chapter reading changes no data and paused teaching resumes its exact checkpoint after reload',async({page})=>{
 await setup(page);await enter(page,'sales');const initial=(await view(page)).workspace;const chapters=page.getByTestId(/^learning-step-/);await chapters.last().click();await expect(page.getByTestId('learning-execute')).toHaveCount(0);await chapters.first().click();expect((await view(page)).workspace).toEqual(initial);
 await execute(page);const checkpoint=(await view(page)).workspace;const progress=await page.getByTestId('learning-progress').getAttribute('aria-valuenow');await page.getByTestId('learning-pause').click();await page.reload();await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'沉浸教學',exact:true}).click();await expect(page.getByTestId('learning-resume')).toBeVisible();await page.getByTestId('learning-resume').click();await expect(page.getByTestId('learning-progress')).toHaveAttribute('aria-valuenow',progress!);expect((await view(page)).workspace).toEqual(checkpoint);await complete(page);moneyAndSafety((await view(page)).workspace);
});

test('disabled modules do not offer unrelated teaching routes',async({page})=>{await setup(page,'零售商店');await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'沉浸教學',exact:true}).click();await expect(page.getByTestId('learning-route-sales')).toBeVisible();await expect(page.getByTestId('learning-route-service')).toHaveCount(0);await expect(page.getByTestId('learning-route-manufacturing')).toHaveCount(0);});

test('320px reduced-motion teaching remains readable without overflow or writes from chapter navigation',async({page})=>{
 await page.setViewportSize({width:320,height:850});await page.emulateMedia({reducedMotion:'reduce'});await setup(page);await page.getByRole('button',{name:'開始流程教學',exact:true}).click();await page.getByTestId('learning-route-manufacturing').click();const before=(await view(page)).workspace;const chapters=page.getByTestId(/^learning-step-/);for(let i=0;i<await chapters.count();i++){await chapters.nth(i).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}expect((await view(page)).workspace).toEqual(before);await chapters.first().click();await execute(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:'test-results/learning-mobile-320.png',fullPage:true});
});

test('undelivered teaching operation recovers the same idempotency key and advances one checkpoint after reload',async({page})=>{
 await setup(page);await enter(page,'sales');const initial=await view(page),keys:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/workspace/commands'))keys.push(r.headers()['idempotency-key']);});await page.route('**/api/workspace/commands',r=>r.abort('failed'),{times:1});await page.getByTestId('learning-execute').click();await expect(page.getByRole('alert').filter({hasText:'上次操作的結果尚未確認'})).toBeVisible();expect((await view(page)).workspace).toEqual(initial.workspace);await page.reload();await page.getByRole('button',{name:'確認原操作結果',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'已確認並恢復原操作。'})).toContainText('已確認並恢復原操作。');expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect((await view(page)).version).toBe(initial.version+1);await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'沉浸教學',exact:true}).click();await expect(page.getByTestId('learning-progress')).toHaveAttribute('aria-valuenow','1');await complete(page);const w=(await view(page)).workspace;expect(w.orders).toHaveLength(initial.workspace.orders.length+1);moneyAndSafety(w);
});

test('clearing and rebuilding a workspace cannot carry teaching checkpoints into its new generation',async({page})=>{
 await setup(page);await enter(page,'sales');await execute(page);const old=(await view(page)).workspace;await page.getByTestId('learning-exit').click();await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'設定與資料',exact:true}).click();await page.getByRole('button',{name:'清除測試資料',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'確認模擬操作',exact:true}).click();await expect(page.getByRole('button',{name:'建立我的測試系統',exact:true})).toBeVisible();await page.getByLabel('店名／工作室名稱',{exact:true}).fill('合成：新世代工作區');await page.getByRole('button',{name:/^一般企業/}).click();await page.getByRole('button',{name:'建立我的測試系統',exact:true}).click();await expect(page.getByRole('heading',{name:'合成：新世代工作區',exact:true})).toBeVisible();const fresh=(await view(page)).workspace;expect(fresh.generation_id).not.toBe(old.generation_id);await enter(page,'sales');await expect(page.getByTestId('learning-evidence')).toContainText('尚無本次操作證據');await expect(page.getByTestId('learning-execute')).toBeEnabled();expect((await view(page)).workspace).toEqual(fresh);
});
test('a committed teaching operation with a lost response recovers its receipt without duplicate execution',async({page})=>{
 await setup(page);await enter(page,'sales');const initial=await view(page),keys:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/workspace/commands'))keys.push(r.headers()['idempotency-key']);});
 await page.route('**/api/workspace/commands',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);await route.abort('failed');},{times:1});
 await page.getByTestId('learning-execute').click();await expect(page.getByRole('alert').filter({hasText:'上次操作的結果尚未確認'})).toBeVisible();expect((await view(page)).version).toBe(initial.version+1);await page.reload();await page.getByRole('button',{name:'確認原操作結果',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'已確認並恢復原操作。'})).toContainText('已確認並恢復原操作。');expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect((await view(page)).version).toBe(initial.version+1);const customer=(await view(page)).workspace.customers.filter((v:any)=>!initial.workspace.customers.some((old:any)=>old.id===v.id));expect(customer).toHaveLength(1);expect(customer[0].name).toMatch(/^教學客戶 /);await expect(page.getByTestId('learning-progress')).toHaveAttribute('aria-valuenow','1');
 await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'沉浸教學',exact:true}).click();await complete(page);const w=(await view(page)).workspace;expect(w.customers.filter((v:any)=>!initial.workspace.customers.some((old:any)=>old.id===v.id))).toHaveLength(1);moneyAndSafety(w);
});

test('switching routes resumes the last lesson and another round preserves previous business records',async({page})=>{
 await setup(page);await enter(page,'sales');await complete(page);const completed=(await view(page)).workspace;
 await page.getByTestId('learning-route-manufacturing').click();await execute(page);const oneStep=(await view(page)).workspace;
 await page.reload();await expect(page.getByTestId('learning-route-manufacturing')).toHaveAttribute('aria-pressed','true');await expect(page.getByTestId('learning-progress')).toHaveAttribute('aria-valuenow','1');expect((await view(page)).workspace).toEqual(oneStep);
 await page.getByTestId('learning-route-sales').click();await expect(page.getByTestId('learning-complete')).toBeVisible();await page.getByTestId('learning-restart').click();await expect(page.getByTestId('learning-progress')).toHaveAttribute('aria-valuenow','0');expect((await view(page)).workspace).toEqual(oneStep);await execute(page);const after=(await view(page)).workspace;expect(after.orders).toEqual(completed.orders);expect(after.customers).toHaveLength(completed.customers.length+1);moneyAndSafety(after);
});

test('chapter navigation waits for the acknowledged operation to finish its slow refresh',async({page})=>{
 await setup(page);await enter(page,'sales');await page.getByTestId('learning-step-customer').click();let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let hold=true;
 await page.route('**/api/workspace/view',async route=>{if(hold&&route.request().resourceType()==='fetch'){hold=false;await gate;}await route.continue();});
 await page.getByTestId('learning-execute').click();
 try{await expect(page.getByTestId('learning-progress')).toHaveAttribute('aria-valuenow','1');await expect(page.getByRole('button',{name:'前往下一個實作步驟',exact:true})).toBeDisabled();await expect(page.getByTestId('learning-step-buyer')).toBeDisabled();}finally{release();}
 await page.getByRole('button',{name:'前往下一個實作步驟',exact:true}).click();await expect(page.getByTestId('learning-execute')).toBeEnabled();await expect(page.getByRole('heading',{name:'建立買家錢包',exact:true})).toBeVisible();expect((await view(page)).workspace.customers.filter((customer:any)=>customer.name.startsWith('教學客戶 '))).toHaveLength(1);
});
