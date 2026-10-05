import {test,expect,type Page} from '@playwright/test';

async function currentView(page:Page){const response=await page.request.get('/api/workspace/view');expect(response.status()).toBe(200);return response.json();}
function watchWrites(page:Page){const writes:string[]=[];page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/'))writes.push(new URL(request.url()).pathname)});return writes;}

test('enterprise blueprint distinguishes the real SIM scope from design and preserves the workspace through footer navigation',async({page})=>{
 await page.goto('/');if(process.env.EXPECTED_PUBLIC_ASSET)await expect(page.locator('script[src]')).toHaveAttribute('src','/assets/'+process.env.EXPECTED_PUBLIC_ASSET);
 const before=await currentView(page),writes=watchWrites(page);
 await page.getByRole('link',{name:'企業功能藍圖 ↗',exact:true}).click();await expect(page).toHaveURL(/\/enterprise-plan(?:\.html)?$/);
 await expect(page.locator('#scale-sme')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#module-detail')).toContainText('設計預覽');
 await page.locator('#tab-mindmap').click();await expect(page.locator('#mindmap-nodes [data-map-module]')).toHaveCount(24);await expect(page.locator('#mindmap-nodes').getByText('SIM 已實作',{exact:true})).toHaveCount(7);await expect(page.locator('#mindmap-nodes').getByText('規劃中',{exact:true})).toHaveCount(17);
 for(const module of ['enterprise','hr','scheduling','attendance','payroll','treasury','accounting','tax','invoices']){
  await page.locator(`#mindmap-nodes [data-map-module="${module}"]`).click();await expect(page.locator('#module-detail')).toHaveAttribute('data-selected-module',module);await expect(page.locator('#module-detail')).toContainText('規劃中');await expect(page.locator('#module-detail')).toContainText('設計預覽');await expect(page.getByTestId('detail-workflow').locator('li')).toHaveCount(3);
 }
 await page.screenshot({path:'test-results/enterprise-blueprint-desktop.png',fullPage:true});
 const after=await currentView(page);expect(after.workspace).toEqual(before.workspace);expect(after.version).toBe(before.version);expect(writes).toEqual([]);
});

test('scale, literal search, keyboard tabs and future workflow steps are readable without executing any enterprise operation',async({page})=>{
 const writes=watchWrites(page);await page.goto('/enterprise-plan.html');await expect(page.locator('#module-catalog [data-module-id]').first()).toBeVisible();
 for(const scale of ['single','sme','multi']){await page.locator('#scale-'+scale).click();await expect(page.locator('#scale-'+scale)).toHaveAttribute('aria-pressed','true');expect(await page.locator('#module-catalog [data-module-id]').count()).toBeGreaterThan(0);}
 await page.locator('#module-search').fill('payroll');await expect(page.locator('#module-catalog [data-module-id]')).toHaveCount(1);await expect(page.locator('#module-catalog [data-module-id="payroll"]')).toBeVisible();
 for(const literal of ['.*[]','<img src=x onerror=alert(1)>']){await page.locator('#module-search').fill(literal);await expect(page.locator('#module-catalog [data-module-id]')).toHaveCount(0);await expect(page.locator('#module-catalog .empty-search')).toBeVisible();}
 await page.locator('#clear-search').click();await expect(page.locator('#module-search')).toBeFocused();await expect(page.locator('#module-search')).toHaveValue('');
 await page.locator('#tab-catalog').focus();await page.keyboard.press('ArrowRight');await expect(page.locator('#tab-flow')).toBeFocused();await expect(page.locator('#tab-flow')).toHaveAttribute('aria-selected','true');
 for(const flow of ['payroll','monthend','procurement']){await page.locator(`[data-flow="${flow}"]`).click();await expect(page.locator(`[data-flow="${flow}"]`)).toHaveAttribute('aria-pressed','true');await expect(page.locator('#flow-steps [data-step-module]')).toHaveCount(6);await page.locator('#flow-steps [data-step-module]').last().click();await expect(page.locator('#module-detail')).toContainText('設計');}
 await page.locator('#tab-roadmap').click();await expect(page.locator('#roadmap-phases > li')).toHaveCount(7);await expect(page.locator('#roadmap-phases')).toContainText('PLANNED');expect(writes).toEqual([]);
});

test('320px reduced-motion design preview contains its controls and static policy allows no network transmission',async({page})=>{
 await page.setViewportSize({width:320,height:760});await page.emulateMedia({reducedMotion:'reduce'});const writes=watchWrites(page);await page.goto('/enterprise-plan.html');
 await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content',/connect-src 'none'/);await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content',/form-action 'none'/);
 for(const tab of ['catalog','flow','dependencies','roadmap','mindmap']){await page.locator('#tab-'+tab).click();await expect(page.locator('#panel-'+tab)).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await page.locator('#mindmap-nodes [data-map-module="payroll"]').focus();await page.keyboard.press('Enter');await expect(page.locator('#module-detail')).toHaveAttribute('data-selected-module','payroll');await expect(page.locator('#module-detail')).toContainText('SIM');
 await expect(page.locator('#module-detail')).toBeFocused();await page.locator('#module-detail [data-detail-return]').click();await expect(page.locator('#tab-mindmap')).toBeFocused();
 expect(await page.locator('form').count()).toBe(0);expect(await page.locator('script[src]').count()).toBe(0);await page.screenshot({path:'test-results/enterprise-blueprint-mobile-320.png',fullPage:true});expect(writes).toEqual([]);
});
