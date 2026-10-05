import {test,expect,type Page,type Locator} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {Buffer as NodeBuffer} from 'node:buffer';

test.use({timezoneId:'Asia/Taipei'});
const company='合成：行政工作台驗收';
const nav=(page:Page)=>page.getByRole('navigation',{name:'工作模組',exact:true});
const dialog=(page:Page)=>page.getByTestId('office-dialog');
const row=(page:Page,id:string)=>page.getByTestId('office-desk').locator('article[data-record-id="'+id+'"]');
async function view(page:Page){
 const response=await page.request.get('/api/workspace/view');
 expect(response.status()).toBe(200);
 return response.json();
}
async function save(page:Page){
 await page.getByTestId('office-save').click();
 await expect(dialog(page)).toHaveCount(0);
}
async function tab(page:Page,name:string){
 await page.getByTestId('office-tab-'+name).click();
 await expect(page.getByTestId('office-tab-'+name)).toHaveAttribute('aria-selected','true');
}
function financialState(world:any){
 return structuredClone({
  products:world.products,wallets:world.wallets,orders:world.orders,services:world.services,
  ledger:world.ledger,purchases:world.purchases,boms:world.boms,workOrders:world.workOrders
 });
}
function dateAfter(day:string,days=1){
 return new Date(Date.parse(day+'T12:00:00.000Z')+days*86400000).toISOString().slice(0,10);
}
async function start(page:Page,industry='零售商店'){
 await page.goto('/');
 if(process.env.EXPECTED_PUBLIC_ASSET)await expect(page.locator('script[src]')).toHaveAttribute('src','/assets/'+process.env.EXPECTED_PUBLIC_ASSET);
 await page.getByLabel('店名／工作室名稱',{exact:true}).fill(company);
 await page.getByRole('button',{name:new RegExp('^'+industry)}).click();
 await page.getByRole('button',{name:'建立我的測試系統',exact:true}).click();
 await expect(page.getByRole('heading',{name:company,exact:true})).toBeVisible();
 const initial=(await view(page)).workspace;
 await page.getByTestId('office-nav').click();
 await expect(page.getByTestId('office-desk')).toBeVisible();
 if(!initial.modules.includes('administration')){
  await expect(page.getByTestId('office-enable')).toBeVisible();
  await page.getByTestId('office-enable').click();
  await save(page);
 }
 await expect(page.getByTestId('office-tab-shifts')).toBeVisible();
 await tab(page,'shifts');
 const day=await page.getByTestId('office-week-day').first().getAttribute('data-date');
 expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
 return {initial,day:day!};
}
async function createUnit(page:Page,name='合成：中山示範店'){
 await tab(page,'units');await page.getByTestId('office-add-unit').click();
 await dialog(page).getByTestId('office-field-name').fill(name);
 await dialog(page).getByTestId('office-field-kind').selectOption('branch');
 await save(page);
 const unit=(await view(page)).workspace.administration.units.find((item:any)=>item.name===name);
 expect(unit).toBeTruthy();
 await expect(row(page,unit.id)).toContainText(name);
 return unit.id as string;
}
async function createStaff(page:Page,unit:string){
 await tab(page,'staff');await page.getByTestId('office-add-staff').click();
 await dialog(page).getByTestId('office-field-code').fill('SIM-ADMIN-A');
 await dialog(page).getByTestId('office-field-alias').fill('合成同仁 A');
 await dialog(page).getByTestId('office-field-unit_id').selectOption(unit);
 await save(page);
 const staff=(await view(page)).workspace.administration.staff.find((item:any)=>item.code==='SIM-ADMIN-A');
 expect(staff).toBeTruthy();
 return staff.id as string;
}
async function people(page:Page){
 const unit=await createUnit(page),staff=await createStaff(page,unit);
 return {unit,staff};
}
async function timeForm(page:Page,kind:'shift'|'attendance',staff:string,start:string,end:string){
 await tab(page,kind==='shift'?'shifts':'attendance');
 await page.getByTestId('office-add-'+kind).click();
 await dialog(page).getByTestId('office-field-staff_id').selectOption(staff);
 await dialog(page).getByTestId('office-field-start_at').fill(start);
 await dialog(page).getByTestId('office-field-end_at').fill(end);
 await dialog(page).getByTestId('office-field-break_minutes').fill('30');
}
async function confirmRow(page:Page,record:Locator,action:string){
 await record.getByTestId('office-'+action).click();await save(page);
}
async function reservationForm(page:Page,equipment:string,staff:string,start:string,end:string){
 await tab(page,'reservations');await page.getByTestId('office-add-reservation').click();
 await dialog(page).getByTestId('office-field-equipment_id').selectOption(equipment);
 await dialog(page).getByTestId('office-field-staff_id').selectOption(staff);
 await dialog(page).getByTestId('office-field-start_at').fill(start);
 await dialog(page).getByTestId('office-field-end_at').fill(end);
 await dialog(page).getByTestId('office-field-purpose').fill('合成：週會測試');
}
function localTime(iso:string,extraMinutes=0){
 return new Date(Date.parse(iso)+(480+extraMinutes)*60000).toISOString().slice(0,16);
}
function worldHash(world:any){
 return createHash('sha256').update(JSON.stringify(world),'utf8').digest('hex');
}
async function seedDemo(page:Page,preset:string,week:string){
 const before=(await view(page)).workspace;
 await page.getByTestId('office-seed-demo').click();
 await dialog(page).getByTestId('office-field-preset').selectOption(preset);
 await dialog(page).getByTestId('office-field-week_start').fill(week);
 await save(page);
 const world=(await view(page)).workspace;
 expect(world.generation_id).toBe(before.generation_id);
 expect(financialState(world)).toEqual(financialState(before));
 await expect(page.getByTestId('office-seed-demo')).toBeDisabled();
 return {before,world};
}

test('existing retail enables an empty personal administration desk without replacing legacy data',async({page})=>{
 const {initial}=await start(page);
 const enabled=(await view(page)).workspace;
 expect(initial.modules).not.toContain('administration');
 expect(enabled.modules).toEqual([...initial.modules,'administration']);
 expect(enabled.generation_id).toBe(initial.generation_id);
 expect(enabled.version).toBe(initial.version+1);
 expect(financialState(enabled)).toEqual(financialState(initial));
 for(const key of ['units','staff','shifts','attendance','requests','equipment','reservations','notices'])expect(enabled.administration[key]).toEqual([]);
 await expect(page.getByTestId('office-desk')).toContainText('整理完成仍未覆核');
 const {unit}=await people(page);
 await tab(page,'units');
 await page.getByTestId('office-unit-filter').selectOption(unit);
 await expect(row(page,unit)).toBeVisible();
 await page.getByTestId('office-unit-filter').selectOption('');
 const stable=(await view(page)).workspace;
 await page.reload();await page.getByTestId('office-nav').click();await tab(page,'staff');
 await expect(page.getByTestId('office-staff')).toContainText('合成同仁 A');
 expect((await view(page)).workspace).toEqual(stable);
 expect(financialState(stable)).toEqual(financialState(initial));
});

test('cross-night roster and manual attendance remain separate and both reject duplicate staff intervals',async({page})=>{
 const {day}=await start(page),{staff}=await people(page);
 await tab(page,'shifts');
 await page.getByRole('button',{name:'前一週',exact:true}).click();
 const pastDay=dateAfter(day,-7);
 const startAt=pastDay+'T22:00',endAt=dateAfter(pastDay)+'T06:00';
 await timeForm(page,'shift',staff,startAt,endAt);await save(page);
 let world=(await view(page)).workspace;
 expect(world.administration.shifts).toHaveLength(1);
 expect(world.administration.attendance).toHaveLength(0);
 const shift=world.administration.shifts[0];
 expect(shift.start_at).toBe(new Date(startAt+':00+08:00').toISOString());
 expect(shift.end_at).toBe(new Date(endAt+':00+08:00').toISOString());
 await expect(row(page,shift.id)).toContainText('跨夜');
 await expect(row(page,shift.id)).toContainText('450 分鐘');
 const planned=world;
 await timeForm(page,'shift',staff,startAt,endAt);await page.getByTestId('office-save').click();
 await expect(page.getByTestId('office-error')).toBeVisible();
 expect((await view(page)).workspace).toEqual(planned);
 await page.getByTestId('office-cancel').click();
 await timeForm(page,'attendance',staff,startAt,endAt);await save(page);
 world=(await view(page)).workspace;
 expect(world.administration.attendance).toHaveLength(1);
 expect(world.administration.shifts).toEqual(planned.administration.shifts);
 expect((await view(page)).report.administration.actual_work_minutes).toBe(450);
 const actual=world;
 await timeForm(page,'attendance',staff,startAt,endAt);await page.getByTestId('office-save').click();
 await expect(page.getByTestId('office-error')).toBeVisible();
 expect((await view(page)).workspace).toEqual(actual);
 await page.getByTestId('office-cancel').click();
 await tab(page,'shifts');await confirmRow(page,row(page,shift.id),'complete-shift');
 world=(await view(page)).workspace;
 expect(world.administration.shifts[0].status).toBe('completed');
 expect(world.administration.attendance).toEqual(actual.administration.attendance);
 await expect(page.getByTestId('office-message')).toContainText('結束班次');
 await expect(page.getByTestId('office-message')).not.toContainText(shift.id);
 await page.screenshot({path:test.info().outputPath('administration-desktop.png'),fullPage:true});
});

test('expense and leave requests return, resubmit, prepare or withdraw without approval or financial writes',async({page})=>{
 const {day}=await start(page),{unit,staff}=await people(page);
 const baseline=financialState((await view(page)).workspace);
 await tab(page,'requests');await page.getByTestId('office-add-request').click();
 await dialog(page).getByTestId('office-field-type').selectOption('expense');
 await dialog(page).getByTestId('office-field-unit_id').selectOption(unit);
 await dialog(page).getByTestId('office-field-staff_id').selectOption(staff);
 await dialog(page).getByTestId('office-field-title').fill('合成：補充材料費');
 await dialog(page).getByTestId('office-field-description').fill('合成用途，沒有真憑證');
 await dialog(page).getByTestId('office-field-amount_sim').fill('1250.50');
 await save(page);
 let request=(await view(page)).workspace.administration.requests.find((item:any)=>item.title==='合成：補充材料費');
 expect(request.amount_minor).toBe(125050);
 expect(request.currency).toBe('SIM');
 const requestRow=row(page,request.id);
 await expect(requestRow).toContainText('草稿');
 await confirmRow(page,requestRow,'submit-request');await expect(requestRow).toContainText('待整理');
 await requestRow.getByTestId('office-return-request').click();
 await dialog(page).getByTestId('office-field-processing_note').fill('合成：補上用途');
 await save(page);await expect(requestRow).toContainText('退回補件');
 await requestRow.getByTestId('office-edit-request').click();
 await dialog(page).getByTestId('office-field-description').fill('合成：已補材料用途');
 await save(page);
 await expect(requestRow.locator('.office-status')).toHaveText('草稿');
 await confirmRow(page,requestRow,'submit-request');
 await expect(requestRow).toContainText('最新退回原因：合成：補上用途');
 await confirmRow(page,requestRow,'prepare-request');
 await expect(requestRow).toContainText('整理完成（未覆核）');
 await expect(requestRow.getByTestId('office-edit-request')).toHaveCount(0);
 const history=requestRow.getByTestId('office-request-history');
 await history.locator('summary').click();
 await expect(history.getByTestId('office-request-transition').filter({hasText:'退回原因：合成：補上用途'})).toBeVisible();
 request=(await view(page)).workspace.administration.requests.find((item:any)=>item.id===request.id);
 expect(request.status).toBe('prepared_unreviewed');
 expect(request.processing_note).toBe('合成：補上用途');
 expect(request.transitions.map((entry:any)=>entry.status)).toEqual(['draft','submitted','returned','draft','submitted','prepared_unreviewed']);
 await page.getByTestId('office-add-request').click();
 await dialog(page).getByTestId('office-field-type').selectOption('leave');
 await dialog(page).getByTestId('office-field-unit_id').selectOption(unit);
 await dialog(page).getByTestId('office-field-staff_id').selectOption(staff);
 await dialog(page).getByTestId('office-field-title').fill('合成：請假時段');
 await dialog(page).getByTestId('office-field-start_at').fill(day+'T09:00');
 await dialog(page).getByTestId('office-field-end_at').fill(dateAfter(day,7)+'T11:00');
 await save(page);
 const leave=(await view(page)).workspace.administration.requests.find((item:any)=>item.title==='合成：請假時段');
 expect(leave.amount_minor).toBe(0);
 await confirmRow(page,row(page,leave.id),'submit-request');
 await confirmRow(page,row(page,leave.id),'withdraw-request');
 await expect(row(page,leave.id)).toContainText('已撤回');
 expect(financialState((await view(page)).workspace)).toEqual(baseline);
 await expect(page.getByTestId('office-desk').getByRole('button',{name:/^(核准|發薪|付款)/})).toHaveCount(0);
});

test('equipment rejects overlapping reservations and an actual return frees the same interval for rebooking',async({page})=>{
 const {day}=await start(page),{unit,staff}=await people(page);
 const baseline=financialState((await view(page)).workspace);
 await tab(page,'equipment');await page.getByTestId('office-add-equipment').click();
 await dialog(page).getByTestId('office-field-code').fill('SIM-PROJECTOR');
 await dialog(page).getByTestId('office-field-name').fill('合成：會議投影機');
 await dialog(page).getByTestId('office-field-unit_id').selectOption(unit);await save(page);
 const equipment=(await view(page)).workspace.administration.equipment[0];
 await reservationForm(page,equipment.id,staff,day+'T09:00',dateAfter(day,7)+'T11:00');await save(page);
 const booked=(await view(page)).workspace,reservation=booked.administration.reservations[0];
 await reservationForm(page,equipment.id,staff,day+'T10:00',dateAfter(day,7)+'T12:00');
 await page.getByTestId('office-save').click();await expect(page.getByTestId('office-error')).toBeVisible();
 expect((await view(page)).workspace).toEqual(booked);
 await page.getByTestId('office-cancel').click();
 await confirmRow(page,row(page,reservation.id),'return-reservation');
 await expect(row(page,reservation.id)).toContainText('已歸還');
 await reservationForm(page,equipment.id,staff,day+'T09:00',dateAfter(day,7)+'T11:00');await save(page);
 const final=(await view(page)).workspace;
 expect(final.administration.reservations.map((item:any)=>item.status)).toEqual(['returned','reserved']);
 expect(final.administration.reservations[0].id).toBe(reservation.id);
 expect(financialState(final)).toEqual(baseline);
});

test('notice search is literal and editing or clearing a Taipei deadline survives reload',async({page})=>{
 await start(page);const unit=await createUnit(page);
 await tab(page,'notices');await page.getByTestId('office-add-notice').click();
 await dialog(page).getByTestId('office-field-title').fill('合成：公告 [.*]');
 await dialog(page).getByTestId('office-field-body').fill('合成：盤點提醒');
 await dialog(page).getByTestId('office-field-unit_id').selectOption(unit);
 await dialog(page).getByTestId('office-field-pinned').check();
 await dialog(page).getByTestId('office-field-due_at').fill('2030-10-05T03:04');await save(page);
 const original=(await view(page)).workspace.administration.notices[0];
 expect(original.due_at).toBe('2030-10-04T19:04:00.000Z');
 await page.getByTestId('office-add-notice').click();
 await dialog(page).getByTestId('office-field-title').fill('合成：另一則公告');await save(page);
 await page.getByTestId('office-search').fill('[.*]');
 await expect(page.getByTestId('office-notice')).toHaveCount(1);
 await expect(row(page,original.id)).toContainText('盤點提醒');
 await page.getByTestId('office-search').fill('no-such-sim-notice');
 await expect(page.getByTestId('office-notice')).toHaveCount(0);
 await page.getByTestId('office-search').fill('');
 await row(page,original.id).getByTestId('office-edit-notice').click();
 await expect(dialog(page).getByTestId('office-field-due_at')).toHaveValue('2030-10-05T03:04');
 await dialog(page).getByTestId('office-field-due_at').fill('');
 await dialog(page).getByTestId('office-field-pinned').uncheck();
 await dialog(page).getByTestId('office-field-body').fill('合成：日期已取消');await save(page);
 const stable=(await view(page)).workspace,edited=stable.administration.notices.find((item:any)=>item.id===original.id);
 expect(edited.created_at).toBe(original.created_at);
 expect(edited.due_at).toBe(null);
 expect(edited.pinned).toBe(false);
 await page.reload();await page.getByTestId('office-nav').click();await tab(page,'notices');
 await expect(row(page,original.id)).toContainText('日期已取消');
 expect((await view(page)).workspace).toEqual(stable);
 const lostTitle='合成：行政回應遺失仍可確認',keys:string[]=[];
 let acknowledged:any;
 page.on('request',request=>{
  if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/workspace/commands')
   keys.push(request.headers()['idempotency-key']);
 });
 await page.route('**/api/workspace/commands',async route=>{
  const response=await route.fetch(),body=await response.json();
  expect(response.status(),JSON.stringify(body)).toBe(200);
  acknowledged=body.workspace;
  await route.abort('failed');
 },{times:1});
 await page.getByTestId('office-add-notice').click();
 await dialog(page).getByTestId('office-field-title').fill(lostTitle);
 await page.getByTestId('office-save').click();
 await expect(dialog(page)).toBeVisible();
 await expect(page.getByTestId('office-save')).toBeDisabled();
 await expect(page.getByTestId('office-cancel')).toBeEnabled();
 await expect(page.getByTestId('office-cancel')).toHaveText('關閉並確認原操作結果');
 await page.getByTestId('office-cancel').click();
 await expect(dialog(page)).toHaveCount(0);
 await expect(page.getByRole('alert').filter({hasText:'上次操作的結果尚未確認'})).toBeVisible();
 const saved=(await view(page)).workspace;
 expect(saved.version).toBe(stable.version+1);
 expect(saved.generation_id).toBe(stable.generation_id);
 expect(worldHash(saved)).toBe(worldHash(acknowledged));
 expect(saved.administration.notices.filter((entry:any)=>entry.title===lostTitle)).toHaveLength(1);
 await page.getByRole('button',{name:'確認原操作結果',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'已確認並恢復原操作。'})).toBeVisible();
 expect(keys).toHaveLength(2);
 expect(keys[1]).toBe(keys[0]);
 expect(worldHash((await view(page)).workspace)).toBe(worldHash(saved));
});

test('the seven legacy modules remain available alongside administration and customer edits keep their source',async({page})=>{
 const {initial}=await start(page,'一般企業');
 const moduleNames=['商品庫存','模擬訂單','測試幣流水','報價與服務','客戶與商機','任務與里程碑','BOM 與製造'];
 for(const name of moduleNames)await expect(nav(page).getByRole('button',{name,exact:true})).toBeVisible();
 expect(initial.modules).toContain('administration');
 await nav(page).getByRole('button',{name:'客戶與商機',exact:true}).click();
 await page.getByRole('button',{name:'新增客戶',exact:true}).click();
 await page.getByRole('dialog').getByLabel(/^客戶名稱/).fill('合成：行政並行顧客');
 await page.getByRole('dialog').getByRole('button',{name:'確認模擬操作',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 const before=(await view(page)).workspace;
 await page.getByTestId('office-nav').click();await tab(page,'notices');await page.getByTestId('office-add-notice').click();
 await dialog(page).getByTestId('office-field-title').fill('合成：行政與舊工作並行');await save(page);
 const after=(await view(page)).workspace;
 expect(after.customers).toEqual(before.customers);
 expect(financialState(after)).toEqual(financialState(before));
 await nav(page).getByRole('button',{name:'客戶與商機',exact:true}).click();
 await expect(page.getByTestId('records-customer')).toContainText('合成：行政並行顧客');
 expect(after.generation_id).toBe(initial.generation_id);
});

test('320px dark compact desk and keyboard dialogs remain contained and cancel without data writes',async({page})=>{
 await page.setViewportSize({width:320,height:850});
 await page.emulateMedia({reducedMotion:'reduce'});
 await start(page);
 const preferences=page.getByTestId('appearance-settings');
 if(!await preferences.evaluate(element=>(element as HTMLDetailsElement).open))await preferences.locator('summary').click();
 await page.getByTestId('interface-theme').selectOption('dark');
 await page.getByTestId('interface-density').selectOption('compact');
 await preferences.locator('summary').click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('html')).toHaveAttribute('data-density','compact');
 await people(page);
 const stable=(await view(page)).workspace;
 for(const section of ['units','staff','shifts','attendance','requests','equipment','reservations','notices']){await tab(page,section);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
 await tab(page,'units');await page.getByTestId('office-tab-units').focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByTestId('office-tab-staff')).toBeFocused();
 await expect(page.getByTestId('office-tab-staff')).toHaveAttribute('aria-selected','true');
 await page.keyboard.press('Home');
 const opener=page.getByTestId('office-add-unit');
 await opener.focus();await page.keyboard.press('Enter');
 await expect(dialog(page)).toBeVisible();
 expect(await dialog(page).evaluate(element=>element.contains(document.activeElement))).toBe(true);
 expect(await dialog(page).evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
 await dialog(page).getByTestId('office-field-name').fill('合成：不儲存的草稿');
 await page.keyboard.press('Escape');
 await expect(dialog(page)).toHaveCount(0);
 await expect(opener).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect((await view(page)).workspace).toEqual(stable);
 await page.screenshot({path:test.info().outputPath('administration-dark-mobile-320.png'),fullPage:true});
});

test('store onboarding continues through corrections void replacement and scoped CSV print without financial effects',async({page})=>{
 test.setTimeout(90000);
 const {day}=await start(page);
 await expect(page.getByTestId('office-onboarding')).toBeVisible();
 await expect(page.getByTestId('office-guide-staff')).toBeDisabled();
 const {before,world:sample}=await seedDemo(page,'store',dateAfter(day,-7));
 await expect(page.getByTestId('office-week-day').first()).toHaveAttribute('data-date',dateAfter(day,-7));
 const shift=sample.administration.shifts[0],actual=sample.administration.attendance[0];
 await row(page,shift.id).getByTestId('office-edit-shift').click();
 await dialog(page).getByTestId('office-field-end_at').fill(localTime(shift.end_at,30));
 await page.getByTestId('office-save').click();
 await expect(dialog(page)).toBeVisible();
 expect((await view(page)).workspace).toEqual(sample);
 await page.keyboard.press('Control+k');
 await expect(page.getByTestId('workspace-search-dialog')).toHaveCount(0);
 await expect(dialog(page)).toBeVisible();
 await dialog(page).getByTestId('office-field-reason').fill('合成：調整店務班次結束時間');
 await save(page);
 let state=(await view(page)).workspace;
 expect(state.administration.changes.find((change:any)=>change.kind==='shift.update').before.end_at).toBe(shift.end_at);
 expect(state.administration.changes.find((change:any)=>change.kind==='shift.update').after.end_at).toBe(new Date(Date.parse(shift.end_at)+1800000).toISOString());
 await tab(page,'attendance');
 await row(page,actual.id).getByTestId('office-edit-attendance').click();
 await dialog(page).getByTestId('office-field-end_at').fill(localTime(actual.end_at,30));
 await dialog(page).getByTestId('office-field-reason').fill('合成：補正漏記半小時');
 await save(page);
 let snapshot=await view(page);
 const corrected=snapshot.workspace.administration.attendance.find((entry:any)=>entry.id===actual.id);
 const correctedMinutes=(Date.parse(corrected.end_at)-Date.parse(corrected.start_at))/60000-corrected.break_minutes;
 const previousTotal=snapshot.report.administration.actual_work_minutes;
 const history=row(page,actual.id).getByTestId('office-record-history');
 await history.locator('summary').click();
 await expect(history).toContainText('原值');
 await expect(history).toContainText('更正後');
 await expect(history).toContainText('補正漏記半小時');
 await row(page,actual.id).getByTestId('office-void-attendance').click();
 await dialog(page).getByTestId('office-field-reason').fill('合成：原紀錄重複，需要重新登錄');
 await save(page);
 snapshot=await view(page);
 expect(snapshot.workspace.administration.attendance.find((entry:any)=>entry.id===actual.id).voided).toBe(true);
 expect(snapshot.report.administration.actual_work_minutes).toBe(previousTotal-correctedMinutes);
 await expect(row(page,actual.id)).toContainText('已作廢');
 await timeForm(page,'attendance',actual.staff_id,localTime(corrected.start_at),localTime(corrected.end_at));
 await dialog(page).getByTestId('office-field-break_minutes').fill(String(corrected.break_minutes));
 await dialog(page).getByTestId('office-field-note').fill('=SUM(1,2)');
 await save(page);
 snapshot=await view(page);state=snapshot.workspace;
 expect(snapshot.report.administration.actual_work_minutes).toBe(previousTotal);
 expect(state.administration.attendance).toHaveLength(3);
 expect(state.administration.attendance.filter((entry:any)=>!entry.voided)).toHaveLength(2);
 expect(financialState(state)).toEqual(financialState(before));
 await page.getByTestId('office-attendance-status-filter').selectOption('active');
 const downloadPromise=page.waitForEvent('download');
 await page.getByTestId('office-export-csv').click();
 const download=await downloadPromise,path=await download.path();
 expect(download.suggestedFilename()).toMatch(/^freedom-administration-attendance-.*\.csv$/);
 expect(path).toBeTruthy();
 const csv=await readFile(path!,'utf8');
 expect(csv.charCodeAt(0)).toBe(0xfeff);
 expect(csv).toContain('Asia/Taipei');
 expect(csv).toContain('SIM');
 expect(csv).toContain("'=SUM(1,2)");
 expect(csv.trim().split(/\r?\n/)).toHaveLength(3);
 await page.evaluate(()=>{(window as any).__officePrintCalls=0;window.print=()=>{(window as any).__officePrintCalls++;};});
 await page.getByTestId('office-print').click();
 expect(await page.evaluate(()=>(window as any).__officePrintCalls)).toBe(1);
 await page.emulateMedia({media:'print'});
 const sheet=page.getByTestId('office-print-sheet');
 await expect(sheet).toBeVisible();
 await expect(sheet.locator('tbody tr')).toHaveCount(2);
 await expect(sheet).toContainText('不作薪資或法定工時依據');
 await page.emulateMedia({media:'screen'});
 expect((await view(page)).workspace).toEqual(state);
});

test('office sample closes reservation correction conflict return rebooking and notice archive restore with reasons',async({page})=>{
 test.setTimeout(90000);
 const {day}=await start(page),{before,world:sample}=await seedDemo(page,'office',dateAfter(day,-7));
 const original=sample.administration.reservations[0],notice=sample.administration.notices.find((entry:any)=>entry.pinned);
 await tab(page,'reservations');
 await row(page,original.id).getByTestId('office-edit-reservation').click();
 await dialog(page).getByTestId('office-field-start_at').fill(localTime(original.start_at,30));
 await dialog(page).getByTestId('office-field-end_at').fill(localTime(original.end_at,30));
 await dialog(page).getByTestId('office-field-reason').fill('合成：會議借用延後半小時');
 await save(page);
 let current=(await view(page)).workspace;
 const corrected=current.administration.reservations.find((entry:any)=>entry.id===original.id);
 const change=current.administration.changes.find((entry:any)=>entry.kind==='reservation.update');
 expect(change.before.start_at).toBe(original.start_at);
 expect(change.after.start_at).toBe(corrected.start_at);
 await reservationForm(page,original.equipment_id,original.staff_id,localTime(original.end_at,60),localTime(original.end_at,180));
 await save(page);
 current=(await view(page)).workspace;
 await row(page,original.id).getByTestId('office-edit-reservation').click();
 await dialog(page).getByTestId('office-field-end_at').fill(localTime(original.end_at,120));
 await dialog(page).getByTestId('office-field-reason').fill('合成：這筆錯誤延長會重疊');
 await page.getByTestId('office-save').click();
 await expect(page.getByTestId('office-error')).toBeVisible();
 expect((await view(page)).workspace).toEqual(current);
 await page.getByTestId('office-cancel').click();
 await confirmRow(page,row(page,original.id),'return-reservation');
 await expect(row(page,original.id)).toContainText('已歸還');
 await reservationForm(page,original.equipment_id,original.staff_id,localTime(corrected.start_at),localTime(corrected.end_at));
 await save(page);
 await tab(page,'notices');
 await confirmRow(page,row(page,notice.id),'archive-notice');
 expect((await view(page)).report.administration.pinned_notices).toBe(0);
 await page.getByTestId('office-notice-state-filter').selectOption('active');
 await expect(row(page,notice.id)).toHaveCount(0);
 await page.getByTestId('office-notice-state-filter').selectOption('archived');
 await expect(row(page,notice.id)).toBeVisible();
 const archiveHistory=row(page,notice.id).getByTestId('office-record-history');
 await archiveHistory.locator('summary').click();
 await expect(archiveHistory).toContainText('封存公告');
 await confirmRow(page,row(page,notice.id),'restore-notice');
 const final=(await view(page)).workspace;
 expect(final.administration.notices.find((entry:any)=>entry.id===notice.id).archived).toBe(false);
 expect(final.administration.changes.filter((entry:any)=>entry.record_id===notice.id).map((entry:any)=>entry.kind)).toEqual(['notice.archive','notice.restore']);
 expect(final.administration.reservations.filter((entry:any)=>entry.status==='reserved')).toHaveLength(2);
 expect(financialState(final)).toEqual(financialState(before));
 await page.reload();await page.getByTestId('office-nav').click();await tab(page,'notices');
 await expect(row(page,notice.id)).toBeVisible();
 expect((await view(page)).workspace).toEqual(final);
});

test('a real browser exports and uploads a backup over 32 KB only after confirmation and restores all records',async({page})=>{
 test.setTimeout(120000);
 await start(page,'一般企業');
 let current=await view(page);
 // Real API writes provide backup volume; export, confirmation, cancellation and
 // restore use the actual browser controls rather than a mocked import response.
 for(let index=0;index<18;index++){
  const response=await page.request.post('/api/workspace/commands',{headers:{
   Origin:new URL(page.url()).origin,'x-csrf-token':current.csrf,
   'Idempotency-Key':randomUUID(),'If-Match-Version':String(current.version)
  },data:{action:'office.notice.create',payload:{title:'合成：備份公告 '+index,body:'合成備份資料'.repeat(200)}}});
  const result=await response.json();
  expect(response.status(),JSON.stringify(result)).toBe(200);
  current={...current,...result};
 }
 await page.reload();await nav(page).getByRole('button',{name:'設定與資料',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByTestId('workspace-backup-export').click();
 const download=await downloadPromise,path=await download.path();
 expect(path).toBeTruthy();
 const bytes=await readFile(path!),source=JSON.parse(new TextDecoder().decode(bytes));
 expect(bytes.length).toBeGreaterThan(32768);
 expect(source.administration.notices).toHaveLength(18);
 await page.getByTestId('office-nav').click();await tab(page,'notices');await page.getByTestId('office-add-notice').click();
 await dialog(page).getByTestId('office-field-title').fill('合成：還原前新增，備份內沒有');await save(page);
 const newer=(await view(page)).workspace,requests:string[]=[];
 page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/api/workspace/import'))requests.push(new URL(request.url()).pathname);});
 await nav(page).getByRole('button',{name:'設定與資料',exact:true}).click();
 const upload={name:'synthetic-large-backup.json',mimeType:'application/json',buffer:bytes};
 await page.getByTestId('workspace-backup-file').setInputFiles(upload);
 await expect(page.getByTestId('workspace-backup-preview')).toBeVisible();
 expect((await view(page)).workspace).toEqual(newer);
 expect(requests).toEqual([]);
 await page.getByTestId('workspace-backup-preview-cancel').click();
 expect((await view(page)).workspace).toEqual(newer);
 await page.getByTestId('workspace-backup-file').setInputFiles(upload);
 await page.getByTestId('workspace-backup-restore').click();
 await expect(page.getByRole('status').filter({hasText:'備份已完整檢查並還原'})).toBeVisible({timeout:60000});
 expect(requests).toContain('/api/workspace/import/begin');
 expect(requests).toContain('/api/workspace/import/part');
 expect(requests).toContain('/api/workspace/import/commit');
 const restored=(await view(page)).workspace;
 expect(restored.generation_id).not.toBe(newer.generation_id);
 expect(restored.version).toBe(newer.version+1);
 expect(worldHash(restored)).toBe(worldHash({...source,generation_id:restored.generation_id,version:restored.version}));
 await page.reload();await page.getByTestId('office-nav').click();await tab(page,'notices');
 await page.getByTestId('office-search').fill('還原前新增');
 await expect(page.getByTestId('office-notice')).toHaveCount(0);
 expect(worldHash((await view(page)).workspace)).toBe(worldHash(restored));
 await page.getByTestId('office-search').fill('');
 await page.getByTestId('office-add-notice').click();
 await dialog(page).getByTestId('office-field-title').fill('合成：測試遺失還原回應');await save(page);
 const beforeLost=(await view(page)).workspace,commitKeys:string[]=[];
 let acknowledged:any;
 page.on('request',request=>{
  if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/workspace/import/commit')
   commitKeys.push(request.headers()['idempotency-key']);
 });
 await page.route('**/api/workspace/import/commit',async route=>{
  const response=await route.fetch(),body=await response.json();
  expect(response.status(),JSON.stringify(body)).toBe(200);
  acknowledged=body.workspace;
  await route.abort('failed');
 },{times:1});
 await nav(page).getByRole('button',{name:'設定與資料',exact:true}).click();
 await page.getByTestId('workspace-backup-file').setInputFiles(upload);
 await page.getByTestId('workspace-backup-restore').click();
 await expect(page.getByRole('alert').filter({hasText:'上次操作的結果尚未確認'})).toBeVisible({timeout:60000});
 const saved=(await view(page)).workspace;
 expect(acknowledged).toBeTruthy();
 expect(saved.generation_id).not.toBe(beforeLost.generation_id);
 expect(saved.version).toBe(beforeLost.version+1);
 expect(worldHash(saved)).toBe(worldHash(acknowledged));
 expect(commitKeys).toHaveLength(1);
 await page.route('**/api/workspace/import/commit',route=>route.fulfill({
  status:429,contentType:'application/json',
  body:JSON.stringify({error:{code:'rate_limit',message:'合成：暫時頻率限制',retry_after_ms:1}})
 }),{times:1});
 await page.getByRole('button',{name:'確認原操作結果',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'上次操作的結果尚未確認'})).toBeVisible();
 expect(commitKeys).toHaveLength(2);
 expect(commitKeys[1]).toBe(commitKeys[0]);
 expect(worldHash((await view(page)).workspace)).toBe(worldHash(saved));
 await page.getByRole('button',{name:'確認原操作結果',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'已確認並恢復原操作。'})).toBeVisible();
 expect(commitKeys).toHaveLength(3);
 expect(commitKeys[2]).toBe(commitKeys[0]);
 const recovered=(await view(page)).workspace;
 expect(recovered.generation_id).toBe(saved.generation_id);
 expect(recovered.version).toBe(saved.version);
 expect(worldHash(recovered)).toBe(worldHash(saved));
});

test('cancelling after the server accepted begin removes the upload and rejects delayed original-key replay',async({page})=>{
 test.setTimeout(90000);
 await start(page,'一般企業');
 let current=await view(page);
 for(let index=0;index<10;index++){
  const response=await page.request.post('/api/workspace/commands',{headers:{
   Origin:new URL(page.url()).origin,'x-csrf-token':current.csrf,
   'Idempotency-Key':randomUUID(),'If-Match-Version':String(current.version)
  },data:{action:'office.notice.create',payload:{title:'合成：取消競態公告 '+index,body:'合成備份資料'.repeat(200)}}});
  const result=await response.json();
  expect(response.status(),JSON.stringify(result)).toBe(200);
  current={...current,...result};
 }
 const original=current.workspace,bytes=new TextEncoder().encode(JSON.stringify(original));
 expect(bytes.length).toBeGreaterThan(32768);
 let release!:()=>void,accepted!:()=>void,beginKey='',manifest:any;
 const hold=new Promise<void>(resolve=>{release=resolve;});
 const begun=new Promise<void>(resolve=>{accepted=resolve;});
 await page.route('**/api/workspace/import/begin',async route=>{
  const response=await route.fetch();
  expect(response.status()).toBe(200);
  beginKey=route.request().headers()['idempotency-key'];
  manifest=route.request().postDataJSON();
  accepted();
  await hold;
  try{await route.abort('failed');}catch{/* The browser may already have aborted its waiting request. */}
 },{times:1});
 await page.reload();await nav(page).getByRole('button',{name:'設定與資料',exact:true}).click();
 await page.getByTestId('workspace-backup-file').setInputFiles({
  name:'synthetic-cancel-race.json',mimeType:'application/json',buffer:NodeBuffer.from(bytes)
 });
 await page.getByTestId('workspace-backup-restore').click();
 await begun;
 await expect(page.getByTestId('workspace-backup-cancel')).toBeVisible();
 await page.getByTestId('workspace-backup-cancel').click();
 release();
 await expect(page.getByRole('status').filter({hasText:'已取消備份傳輸'})).toBeVisible();
 expect((await view(page)).workspace).toEqual(original);
 const status=await (await page.request.get('/api/workspace/import/status')).json();
 expect(status.stage).toBe(null);
 const fresh=await view(page);
 const replay=await page.request.post('/api/workspace/import/begin',{headers:{
  Origin:new URL(page.url()).origin,'x-csrf-token':fresh.csrf,
  'Idempotency-Key':beginKey,'If-Match-Version':String(fresh.version)
 },data:manifest});
 const rejected=await replay.json();
 expect(replay.status()).toBe(409);
 expect(rejected.error.code).toBe('import_cancelled');
 expect((await view(page)).workspace).toEqual(original);
});
