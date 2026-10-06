import {test,expect,type Page} from '@playwright/test';

const mutationPaths=new Set(['/api/workspace/setup','/api/workspace/clear','/api/workspace/import','/api/workspace/commands']);
type Write={path:string;key:string;body:any};
function watchWrites(page:Page){
 const writes:Write[]=[];
 page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&mutationPaths.has(path))writes.push({path,key:request.headers()['idempotency-key'],body:request.postDataJSON()});});
 return writes;
}
async function view(page:Page){const response=await page.request.get('/api/workspace/view');expect(response.status()).toBe(200);return response.json();}
async function fresh(page:Page){
 await page.goto('/');
 if(process.env.EXPECTED_PUBLIC_ASSET)await expect(page.locator('script[src]')).toHaveAttribute('src','/assets/'+process.env.EXPECTED_PUBLIC_ASSET);
 await expect(page.getByTestId('build-center')).toBeVisible();await expect(page).toHaveURL(/#build$/);
 await expect(page.getByTestId('build-step-1')).toHaveAttribute('aria-current','step');
}
async function review(page:Page,company:string,industry='restaurant'){
 await page.getByTestId('build-company').fill(company);await page.getByTestId('build-template-'+industry).click();
 await page.getByRole('button',{name:'下一步：確認功能',exact:true}).click();
 await expect(page.getByTestId('build-step-2')).toHaveAttribute('aria-current','step');
 await page.getByRole('button',{name:'下一步：預覽系統',exact:true}).click();
 await expect(page.getByTestId('build-step-3')).toHaveAttribute('aria-current','step');
 await expect(page.getByTestId('build-plan')).toContainText(company);
 await expect(page.getByRole('button',{name:'建立我的系統',exact:true})).toBeEnabled();
}
async function create(page:Page,company:string,industry='restaurant'){
 await review(page,company,industry);await page.getByRole('button',{name:'建立我的系統',exact:true}).click();
 await expect(page.getByTestId('workspace-overview-heading')).toHaveText(company);
 await expect(page.getByTestId('first-run-guide')).toBeVisible();
}
function emptyFinancialHistory(workspace:any){
 expect(workspace.currency).toBe('SIM');expect(workspace.simulation).toBe(true);expect(workspace.real_finance).toBe(false);
 expect(workspace.ledger).toEqual([]);expect(workspace.orders).toEqual([]);expect(workspace.services.every((row:any)=>row.status==='draft'&&!row.paid_minor)).toBe(true);expect(workspace.workOrders).toEqual([]);
 expect(workspace.products.every((row:any)=>row.on_hand===0&&row.reserved===0)).toBe(true);
 expect(workspace.wallets.every((row:any)=>row.balance_minor===0)).toBe(true);
}

test('a first visitor creates an own named industry workspace directly from the root with only one explicit write',async({page})=>{
 const writes=watchWrites(page);await fresh(page);const initial=await view(page);expect(initial.workspace).toBeNull();
 await review(page,'合成：新手自由咖啡館');expect(writes).toEqual([]);
 await page.getByTestId('build-create').click();await expect(page.getByTestId('workspace-overview-heading')).toHaveText('合成：新手自由咖啡館');
 await expect(page.getByTestId('workspace-overview-heading')).toBeFocused();await expect(page.getByTestId('first-run-guide')).toBeVisible();
 await expect(page.getByTestId('guide-status-records')).not.toHaveClass(/is-done/);await expect(page.getByTestId('guide-status-operation')).not.toHaveClass(/is-done/);
 await expect(page.getByTestId('learning-studio')).toHaveCount(0);await expect(page.getByTestId('build-center')).toHaveCount(0);
 const created=await view(page);expect(created.version).toBe(initial.version+1);expect(created.workspace.company_name).toBe('合成：新手自由咖啡館');expect(created.workspace.industry).toBe('restaurant');
 emptyFinancialHistory(created.workspace);expect(writes).toHaveLength(1);expect(writes[0].path).toBe('/api/workspace/setup');expect(writes[0].key).toBeTruthy();
 await page.screenshot({path:test.info().outputPath('guided-created-workspace-desktop.png'),fullPage:true});
});

test('the first-workspace guide opens useful destinations and can be dismissed and restored without writing business records',async({page})=>{
 await fresh(page);await create(page,'合成：可以直接開始');const stable=await view(page),writes=watchWrites(page);
 await page.getByTestId('guide-start-main').click();await expect(page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'商品庫存',exact:true})).toHaveClass(/active/);
 await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'工作總覽',exact:true}).click();
 await page.getByTestId('guide-start-learning').click();await expect(page.getByTestId('learning-studio')).toBeVisible();
 await page.getByTestId('learning-exit').click();await page.getByTestId('guide-open-settings').click();await expect(page.getByRole('heading',{name:'設定與資料',exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'工作模組',exact:true}).getByRole('button',{name:'工作總覽',exact:true}).click();
 await expect(page.getByTestId('guide-status-records')).not.toHaveClass(/is-done/);await expect(page.getByTestId('guide-status-operation')).not.toHaveClass(/is-done/);await page.getByTestId('guide-dismiss').click();await expect(page.getByTestId('first-run-guide')).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('guide-reopen')).toBeVisible();await expect(page.getByTestId('first-run-guide')).toHaveCount(0);
 await page.getByTestId('guide-reopen').click();await expect(page.getByTestId('first-run-guide')).toBeVisible();
 expect((await view(page)).workspace).toEqual(stable.workspace);expect((await view(page)).version).toBe(stable.version);expect(writes).toEqual([]);
});

test('reload and a later visit to the root preserve the same own workspace instead of prompting another setup',async({page})=>{
 await fresh(page);await create(page,'合成：每次回來都是同一店');const stable=await view(page),writes=watchWrites(page);
 await page.reload();await expect(page.getByTestId('workspace-overview-heading')).toHaveText('合成：每次回來都是同一店');
 await page.goto('/');await expect(page.getByTestId('workspace-overview-heading')).toHaveText('合成：每次回來都是同一店');
 await expect(page.getByTestId('build-center')).toHaveCount(0);expect((await view(page)).workspace).toEqual(stable.workspace);expect((await view(page)).version).toBe(stable.version);expect(writes).toEqual([]);
});

for(const delivery of ['before-server','after-server-commit'] as const)test(`an uncertain setup ${delivery} reloads and recovers its original receipt without a second creation`,async({page})=>{
 await fresh(page);const initial=await view(page),writes=watchWrites(page);await review(page,'合成：建立結果安全復原','manufacturing');
 await page.route('**/api/workspace/setup',async route=>{
  if(delivery==='after-server-commit'){const response=await route.fetch();expect(response.status()).toBe(200);}
  await route.abort('failed');
 },{times:1});
 await page.getByTestId('build-create').click();await expect(page.getByRole('button',{name:'確認原操作結果',exact:true})).toBeVisible();
 const uncertain=await view(page);expect(uncertain.version).toBe(initial.version+(delivery==='after-server-commit'?1:0));
 const original=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('freedom-erp.pending.v1')!));
 expect(original.path).toBe('/api/workspace/setup');expect(original.key).toBe(writes[0].key);expect(original.version).toBe(initial.version);
 await page.reload();await expect(page.getByRole('button',{name:'確認原操作結果',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'確認原操作結果',exact:true}).click();await expect(page.getByTestId('workspace-overview-heading')).toHaveText('合成：建立結果安全復原');
 await expect(page.getByTestId('first-run-guide')).toBeVisible();await expect(page.getByTestId('learning-studio')).toHaveCount(0);
 const recovered=await view(page);expect(recovered.version).toBe(initial.version+1);expect(recovered.workspace.industry).toBe('manufacturing');
 if(uncertain.workspace)expect(recovered.workspace).toEqual(uncertain.workspace);
 emptyFinancialHistory(recovered.workspace);expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);
 expect(await page.evaluate(()=>sessionStorage.getItem('freedom-erp.pending.v1'))).toBeNull();
 await page.reload();expect((await view(page)).workspace).toEqual(recovered.workspace);expect(writes).toHaveLength(2);
});

test('blank names and an empty module choice cannot skip ahead or write a workspace',async({page})=>{
 const writes=watchWrites(page);await fresh(page);const stable=await view(page);
 await expect(page.getByTestId('build-next')).toBeDisabled();await expect(page.getByTestId('build-step-2')).toBeDisabled();await expect(page.getByTestId('build-step-3')).toBeDisabled();
 for(const name of ['', '   ']){
  await page.getByTestId('build-company').fill('合成：先寫名稱');await page.getByTestId('build-company').fill(name);
  await expect(page.getByTestId('build-company')).toHaveAttribute('aria-invalid','true');await expect(page.getByTestId('build-next')).toBeDisabled();
  await expect(page.getByTestId('build-center').getByRole('alert')).toContainText('請填入店名／工作室名稱。');
 }
 await page.getByTestId('build-company').fill('合成：需要至少一個功能');await page.getByTestId('build-template-general').click();await page.getByTestId('build-next').click();
 for(const module of ['inventory','sales','wallets','services','crm','projects','manufacturing','administration']){
  const choice=page.getByTestId('build-module-'+module);if(await choice.count()&&await choice.isChecked())await choice.uncheck();
 }
 await expect(page.getByTestId('build-next')).toBeDisabled();await expect(page.getByTestId('build-center').getByRole('alert')).toContainText('請至少保留一個功能。');
 await expect(page.getByTestId('build-step-3')).toBeDisabled();expect((await view(page)).workspace).toEqual(stable.workspace);expect((await view(page)).version).toBe(stable.version);expect(writes).toEqual([]);
});

test('a 320px newcomer can build with keyboard controls and reduced motion without horizontal overflow',async({page})=>{
 await page.setViewportSize({width:320,height:850});await page.emulateMedia({reducedMotion:'reduce'});const writes=watchWrites(page);await fresh(page);
 await page.getByTestId('build-company').focus();await page.keyboard.type('SIM Keyboard Cafe');
 await page.getByTestId('build-template-restaurant').focus();await page.keyboard.press('Enter');
 for(const step of [1,2,3]){
  await expect(page.getByTestId('build-step-'+step)).toHaveAttribute('aria-current','step');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const button=page.getByTestId(step===3?'build-create':'build-next');expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await button.focus();await page.keyboard.press('Enter');
 }
 await expect(page.getByTestId('workspace-overview-heading')).toHaveText('SIM Keyboard Cafe');await expect(page.getByTestId('workspace-overview-heading')).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
 await page.getByTestId('guide-dismiss').focus();await page.keyboard.press('Enter');await expect(page.getByTestId('guide-reopen')).toBeVisible();
 await page.getByTestId('guide-reopen').focus();await page.keyboard.press('Enter');await expect(page.getByTestId('first-run-guide')).toBeVisible();
 emptyFinancialHistory((await view(page)).workspace);expect(writes).toHaveLength(1);await page.screenshot({path:test.info().outputPath('guided-created-workspace-mobile-320.png'),fullPage:true});
});

test('explicit learning and design links still open their destinations and never create transactions by navigation',async({page})=>{
 const writes=watchWrites(page);await page.goto('/#design');await expect(page.getByTestId('design-studio')).toBeVisible();expect((await view(page)).workspace).toBeNull();expect(writes).toEqual([]);
 await page.goto('/');await expect(page.getByTestId('build-center')).toBeVisible();await create(page,'合成：明確教學與設計入口','service');const stable=await view(page);
 await page.goto('/#learning');await expect(page.getByTestId('learning-studio')).toBeVisible();await expect(page).toHaveURL(/#learning$/);
 await page.goto('/#design');await expect(page.getByTestId('design-studio')).toBeVisible();await expect(page).toHaveURL(/#design$/);
 expect((await view(page)).workspace).toEqual(stable.workspace);expect((await view(page)).version).toBe(stable.version);expect(writes).toHaveLength(1);emptyFinancialHistory(stable.workspace);
});

test('two newcomers create isolated companies through the same guided entry without seeing one another',async({page,browser})=>{
 await fresh(page);await create(page,'合成：甲的咖啡館');const first=await view(page),writes=watchWrites(page);
 const other=await browser.newContext();try{
  const second=await other.newPage();await fresh(second);expect((await view(second)).workspace).toBeNull();
  await create(second,'合成：乙的服務店','service');const secondView=await view(second);
  expect(secondView.workspace.company_name).toBe('合成：乙的服務店');expect(secondView.workspace.generation_id).not.toBe(first.workspace.generation_id);
  expect(secondView.workspace.industry).toBe('service');expect(secondView.csrf).not.toBe(first.csrf);
  await page.reload();await expect(page.getByTestId('workspace-overview-heading')).toHaveText('合成：甲的咖啡館');
  expect((await view(page)).workspace).toEqual(first.workspace);expect((await view(page)).version).toBe(first.version);emptyFinancialHistory(secondView.workspace);expect(writes).toEqual([]);
 }finally{await other.close();}
});
