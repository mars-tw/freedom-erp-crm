import {test,expect,type Page,type Locator} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {designTemplates} from '../../web/design-templates.js';

const ids=['harbor','executive','atelier','commerce','industrial','verdant','editorial','midnight'];
const designKey='freedom-erp.design.v1',interfaceKey='freedom-erp.interface.v1';
const nav=(page:Page)=>page.getByRole('navigation',{name:'工作模組',exact:true});
const gallery=(page:Page)=>page.getByTestId('design-studio');
async function view(page:Page){
 const response=await page.request.get('/api/workspace/view');
 expect(response.status()).toBe(200);
 return response.json();
}
function watchWrites(page:Page){
 const writes:string[]=[];
 page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname.startsWith('/api/'))writes.push(new URL(request.url()).pathname);});
 return writes;
}
async function openGallery(page:Page){
 if(!await gallery(page).isVisible())await page.getByTestId('design-studio-open').click();
 await expect(gallery(page)).toBeVisible();
}
async function apply(page:Page,id:string){
 await openGallery(page);
 const button=page.getByTestId('design-apply-'+id);
 if(await button.isEnabled())await button.click();
 await expect(page.locator('html')).toHaveAttribute('data-design',id);
}
async function appearance(page:Page,theme:'light'|'dark',density:'comfortable'|'compact'='comfortable'){
 const preferences=page.getByTestId('appearance-settings');
 if(!await preferences.evaluate(element=>(element as HTMLDetailsElement).open))await preferences.locator('summary').click();
 await page.getByTestId('interface-theme').selectOption(theme);
 await page.getByTestId('interface-density').selectOption(density);
 await preferences.locator('summary').click();
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 await expect(page.locator('html')).toHaveAttribute('data-density',density);
}
async function setup(page:Page){
 await page.goto('/');
 if(process.env.EXPECTED_PUBLIC_ASSET)await expect(page.locator('script[src]')).toHaveAttribute('src','/assets/'+process.env.EXPECTED_PUBLIC_ASSET);
 await page.getByLabel('店名／工作室名稱',{exact:true}).fill('合成：八套外觀驗收');
 await page.getByRole('button',{name:/^一般企業/}).click();
 await page.getByRole('button',{name:'建立我的測試系統',exact:true}).click();
 await expect(page.getByRole('heading',{name:'合成：八套外觀驗收',exact:true})).toBeVisible();
}
async function populated(page:Page){
 await setup(page);
 let current=await view(page);
 const create=async(action:string,payload:any)=>{
  const response=await page.request.post('/api/workspace/commands',{headers:{
   Origin:new URL(page.url()).origin,'x-csrf-token':current.csrf,
   'Idempotency-Key':randomUUID(),'If-Match-Version':String(current.version)
  },data:{action,payload}});
  const result=await response.json();expect(response.status(),JSON.stringify(result)).toBe(200);
  current={...current,...result};return result;
 };
 const initial=current.workspace,business=initial.wallets.find((row:any)=>row.kind==='business'),buyer=initial.wallets.find((row:any)=>row.kind==='buyer');
 await create('wallet.fund',{wallet_id:business.id,amount_minor:1000000});
 await create('inventory.receive',{product_id:initial.products[0].id,quantity:1});
 const order=await create('order.create',{buyer_wallet_id:buyer.id,lines:[{product_id:initial.products[0].id,quantity:1}]});
 await create('office.demo.create',{preset:'store',week_start:'2020-01-06'});
 await page.reload();return {world:(await view(page)).workspace,orderId:order.result};
}
async function readable(locator:Locator,minimum?:number,problems?:string[],label='text'){
 await expect(locator).toBeVisible();
 const measured=await locator.evaluate(element=>{
  const color=(value:string)=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
   const context=canvas.getContext('2d')!;context.fillStyle=value;context.fillRect(0,0,1,1);
   return [...context.getImageData(0,0,1,1).data];
  };
  const blend=(foreground:number[],background:number[])=>{
   const alpha=foreground[3]/255;
   return foreground.slice(0,3).map((value,index)=>value*alpha+background[index]*(1-alpha));
  };
  const ancestors:Element[]=[];for(let node:Element|null=element;node;node=node.parentElement)ancestors.push(node);
  let background=[255,255,255];
  for(const node of ancestors.reverse())background=blend(color(getComputedStyle(node).backgroundColor),background);
  const foreground=blend(color(getComputedStyle(element).color),background);
  const luminance=(values:number[])=>values.map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;})
   .reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
  const text=luminance(foreground),surface=luminance(background),style=getComputedStyle(element);
  const large=parseFloat(style.fontSize)>=24||(parseInt(style.fontWeight)>=700&&parseFloat(style.fontSize)>=18.66);
  return {ratio:(Math.max(text,surface)+0.05)/(Math.min(text,surface)+0.05),minimum:large?3:4.5,
   foreground:style.color,background:background.map(value=>Math.round(value)).join(',')};
 });
 const required=minimum??measured.minimum;
 if(problems){
  if(measured.ratio<required)problems.push(label+': '+measured.ratio.toFixed(3)+' < '+required.toFixed(2)+'; fg='+measured.foreground+'; bg=rgb('+measured.background+')');
 }else expect(measured.ratio).toBeGreaterThanOrEqual(required);
}

test('the empty-workspace gallery lists eight identities and filters and literal search never create data',async({page})=>{
 await page.goto('/#design');await expect(gallery(page)).toBeVisible();
 const before=await view(page),writes=watchWrites(page);
 expect(before.workspace).toBe(null);
 for(const id of ids)await expect(page.getByTestId('design-card-'+id)).toBeVisible();
 for(const category of ['business','store','creative','factory']){
  await page.getByTestId('design-filter-'+category).click();
  const expected=designTemplates.filter(template=>template.category===category).map(template=>template.id);
  for(const id of ids)await expect(page.getByTestId('design-card-'+id)).toHaveCount(expected.includes(id as any)?1:0);
 }
 await page.getByTestId('design-filter-all').click();
 await page.getByTestId('design-search').fill('VeRdAnT');
 await expect(page.getByTestId('design-card-verdant')).toBeVisible();
 await expect(gallery(page).locator('[data-testid^="design-card-"]')).toHaveCount(1);
 await page.getByTestId('design-search').fill('.*');
 await expect(page.getByTestId('design-empty')).toContainText('沒有符合的設計模板。');
 await page.getByTestId('design-clear-search').click();
 await expect(page.getByTestId('design-search')).toBeFocused();
 await expect(gallery(page).locator('[data-testid^="design-card-"]')).toHaveCount(8);
 await page.getByTestId('design-preview-atelier').click();
 await page.getByTestId('design-open-workspace').click();
 await expect(page.locator('html')).toHaveAttribute('data-design','atelier');
 await expect(page.getByTestId('design-preview-banner')).toBeVisible();
 await expect(page.getByRole('button',{name:'建立我的測試系統',exact:true})).toBeDisabled();
 await page.getByTestId('design-preview-cancel').click();
 await expect(page.locator('html')).toHaveAttribute('data-design','harbor');
 await expect(page.getByTestId('design-studio-open')).toBeFocused();
 expect((await view(page)).workspace).toBe(null);expect((await view(page)).version).toBe(before.version);
 expect(writes).toEqual([]);
});

test('preview cancel restores only the chosen design and workspace inspection can return to apply or cancel',async({page})=>{
 await setup(page);await apply(page,'harbor');await appearance(page,'light');
 const stable=(await view(page)).workspace,writes=watchWrites(page);
 const saved=await page.evaluate(key=>localStorage.getItem(key),designKey);
 await page.getByTestId('design-preview-executive').click();
 await expect(page.locator('html')).toHaveAttribute('data-design','executive');
 expect(await page.evaluate(key=>localStorage.getItem(key),designKey)).toBe(saved);
 await appearance(page,'dark','compact');
 await page.getByTestId('design-preview-cancel').click();
 await expect(page.locator('html')).toHaveAttribute('data-design','harbor');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('html')).toHaveAttribute('data-density','compact');
 await expect(page.getByTestId('design-preview-executive')).toBeFocused();
 await page.getByTestId('design-preview-commerce').click();
 await page.getByTestId('design-open-workspace').click();
 await expect(page.getByRole('heading',{name:'合成：八套外觀驗收',exact:true})).toBeVisible();
 await expect(page.locator('html')).toHaveAttribute('data-design','commerce');
 await expect(page.getByTestId('quick-create-open')).toBeDisabled();
 await page.getByTestId('design-studio-open').click();
 await expect(page.getByTestId('design-preview-banner')).toBeVisible();
 await page.getByTestId('design-preview-apply').click();
 await expect(page.getByTestId('design-preview-banner')).toHaveCount(0);
 expect(JSON.parse((await page.evaluate(key=>localStorage.getItem(key),designKey))!)).toEqual({version:1,template:'commerce'});
 await page.getByTestId('design-preview-editorial').click();
 await page.getByTestId('design-open-workspace').click();
 await page.getByTestId('design-preview-cancel').click();
 await expect(page.locator('html')).toHaveAttribute('data-design','commerce');
 await expect(page.getByTestId('design-studio-open')).toBeFocused();
 await openGallery(page);await page.getByTestId('design-preview-midnight').click();
 await nav(page).getByRole('button',{name:'客戶與商機',exact:true}).click();
 await expect(page.getByTestId('design-preview-banner')).toHaveCount(0);
 await expect(page.locator('html')).toHaveAttribute('data-design','commerce');
 expect((await view(page)).workspace).toEqual(stable);expect(writes).toEqual([]);
});

test('applying persists across reload and denied storage keeps an honest current-tab fallback without touching other preferences',async({page})=>{
 await setup(page);await apply(page,'harbor');await appearance(page,'dark','compact');
 const stable=(await view(page)).workspace,legacy=await page.evaluate(key=>localStorage.getItem(key),interfaceKey),writes=watchWrites(page);
 await apply(page,'verdant');await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-design','verdant');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(await page.evaluate(key=>localStorage.getItem(key),interfaceKey)).toBe(legacy);
 await page.evaluate(key=>{
  const original=Storage.prototype.setItem;(window as any).__designStorageSetter=original;
  Storage.prototype.setItem=function(name:string,value:string){if(name===key)throw new DOMException('blocked','QuotaExceededError');return original.call(this,name,value);};
 },designKey);
 await apply(page,'editorial');
 expect(JSON.parse((await page.evaluate(key=>localStorage.getItem(key),designKey))!).template).toBe('verdant');
 await nav(page).getByRole('button',{name:'工作總覽',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-design','editorial');
 await openGallery(page);
 await expect(gallery(page)).toContainText(/本分頁|此分頁|這個分頁/);
 await page.evaluate(()=>{Storage.prototype.setItem=(window as any).__designStorageSetter;});
 await apply(page,'midnight');await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-design','midnight');
 expect(await page.evaluate(key=>localStorage.getItem(key),interfaceKey)).toBe(legacy);
 expect((await view(page)).workspace).toEqual(stable);expect(writes).toEqual([]);
});

test('all eight desktop identities have distinct real palettes and layouts with readable light and dark workspace text',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:1440,height:1000});await setup(page);
 const stable=(await view(page)).workspace,writes=watchWrites(page),palettes=new Set<string>(),layouts=new Set<string>(),problems:string[]=[];
 for(const id of ids){
  await apply(page,id);
  for(const theme of ['light','dark'] as const){
   await appearance(page,theme);await nav(page).getByRole('button',{name:'工作總覽',exact:true}).click();
   await readable(page.locator('.page-heading h1'),undefined,problems,id+'/'+theme+'/workspace h1');
   await readable(page.locator('.page-heading p'),4.5,problems,id+'/'+theme+'/workspace p');
   await readable(page.locator('.learning-entry h2'),undefined,problems,id+'/'+theme+'/learning h2');
   await readable(page.locator('.learning-entry p'),4.5,problems,id+'/'+theme+'/learning p');
   await readable(page.getByTestId('design-studio-open'),4.5,problems,id+'/'+theme+'/design entry button');
   const signature=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement),sidebar=getComputedStyle(document.querySelector('.sidebar')!),layout=getComputedStyle(document.querySelector('.app-layout')!);
    return {palette:[root.getPropertyValue('--design-bg'),root.getPropertyValue('--design-surface'),root.getPropertyValue('--design-text'),root.getPropertyValue('--design-accent')].join('|'),
     layout:[layout.display,layout.gridTemplateColumns,sidebar.width,sidebar.borderRadius,sidebar.position].join('|')};
   });
   if(theme==='light'){palettes.add(signature.palette);layouts.add(signature.layout);}
   await page.screenshot({path:test.info().outputPath('design-'+id+'-'+theme+'-desktop.png'),fullPage:false});
  }
 }
 expect(palettes.size).toBe(8);expect(layouts.size).toBeGreaterThanOrEqual(3);
 await test.info().attach('workspace-contrast-matrix',{body:JSON.stringify(problems,null,2),contentType:'application/json'});
 expect(problems).toEqual([]);
 expect((await view(page)).workspace).toEqual(stable);expect(writes).toEqual([]);
});

test('all templates preserve real forms readiness and administrative print output without appearance mutations',async({page})=>{
 test.setTimeout(120000);const {world:stable,orderId}=await populated(page),writes=watchWrites(page);
 for(const id of ids){
  await apply(page,id);await appearance(page,'dark','compact');
  await nav(page).getByRole('button',{name:'模擬訂單',exact:true}).click();
  const readiness=page.locator('article[data-record-id="'+orderId+'"]').getByTestId('readiness-order');
  await expect(readiness).toContainText('測試幣');await readable(readiness.locator('span').first(),4.5);
  await nav(page).getByRole('button',{name:'客戶與商機',exact:true}).click();
  await page.getByRole('button',{name:'新增客戶',exact:true}).click();
  const form=page.getByRole('dialog');
  await readable(form.locator('h2'));await readable(form.locator('label').first(),4.5);
  expect(await form.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await form.getByRole('button',{name:'取消',exact:true}).click();
  await page.getByTestId('office-nav').click();await page.getByTestId('office-tab-units').click();
  await readable(page.getByTestId('office-desk').locator('.office-heading h1'));await readable(page.getByTestId('office-unit').first().locator('h2'));
  await page.getByTestId('office-add-unit').click();
  const office=page.getByTestId('office-dialog');
  await readable(office.locator('h2'));await readable(office.locator('label').first(),4.5);
  await page.getByTestId('office-cancel').click();
  await page.emulateMedia({media:'print'});
  const sheet=page.getByTestId('office-print-sheet');
  await expect(sheet).toBeVisible();await expect(sheet.locator('tbody tr')).toHaveCount(1);
  await readable(sheet,4.5);await expect(sheet).toContainText('SIM');
  await page.emulateMedia({media:'screen'});
 }
 expect((await view(page)).workspace).toEqual(stable);expect(writes).toEqual([]);
});

test('320px reduced-motion preview navigation and dialogs stay contained across all eight layouts and restore focus',async({page})=>{
 test.setTimeout(120000);await page.setViewportSize({width:320,height:850});await page.emulateMedia({reducedMotion:'reduce'});
 await populated(page);const stable=(await view(page)).workspace,writes=watchWrites(page);
 for(const id of ids){
  await openGallery(page);
  const preview=page.getByTestId('design-preview-'+id);await preview.focus();await page.keyboard.press('Enter');
  await expect(page.getByTestId('design-preview-banner')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByTestId('design-preview-cancel').click();await expect(preview).toBeFocused();
  await apply(page,id);await appearance(page,'dark','compact');
  await page.getByTestId('office-nav').click();await page.getByTestId('office-tab-units').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  const opener=page.getByTestId('office-add-unit');await opener.focus();await page.keyboard.press('Enter');
  const office=page.getByTestId('office-dialog');await expect(office).toBeVisible();
  expect(await office.evaluate(element=>element.contains(document.activeElement))).toBe(true);
  expect(await office.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await page.keyboard.press('Escape');await expect(office).toHaveCount(0);await expect(opener).toBeFocused();
  await page.screenshot({path:test.info().outputPath('design-'+id+'-dark-mobile-320.png'),fullPage:false});
 }
 expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
 expect((await view(page)).workspace).toEqual(stable);expect(writes).toEqual([]);
});

test('a chosen template still runs an explicitly confirmed real command exactly once after leaving preview',async({page})=>{
 await setup(page);await apply(page,'industrial');
 const before=(await view(page)).workspace,writes=watchWrites(page);
 await page.getByTestId('office-nav').click();await page.getByTestId('office-tab-units').click();
 await page.getByTestId('office-add-unit').click();
 await page.getByTestId('office-dialog').getByTestId('office-field-name').fill('合成：工廠模板下的新單位');
 await page.getByTestId('office-dialog').getByTestId('office-field-kind').selectOption('department');
 await page.getByTestId('office-save').click();await expect(page.getByTestId('office-dialog')).toHaveCount(0);
 const after=(await view(page)).workspace;
 expect(after.version).toBe(before.version+1);expect(after.generation_id).toBe(before.generation_id);
 expect(after.administration.units.filter((row:any)=>row.name==='合成：工廠模板下的新單位')).toHaveLength(1);
 expect(after.wallets).toEqual(before.wallets);expect(after.ledger).toEqual(before.ledger);
 expect(writes).toEqual(['/api/workspace/commands']);
 await expect(page.locator('html')).toHaveAttribute('data-design','industrial');
});
