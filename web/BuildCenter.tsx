/// <reference types="vite/client" />
import React, {useEffect, useMemo, useRef, useState} from 'react';
import catalog from '../templates/catalog.json';
import {normalizeLaunchConfig, type LaunchConfig} from '../bin/launch-config.mjs';
import schemaSource from '../bin/launch-config.mjs?raw';
import {buildLaunchKit, launchConfigText, setupCommand} from './launch-kit';
import {Icon, type IconName} from './icons';
import type {Workspace} from './api';
import './build-center.css';

export type {LaunchConfig} from '../bin/launch-config.mjs';
export type BuilderDefaults = {industry:string; company_name:string; modules?:string[]; public_demo?:boolean};
type Destination = 'public' | 'local';
type Draft = {industry:string; company:string; modules:string[]; destination:Destination};
const moduleLabels:Record<string,string> = {inventory:'商品庫存', sales:'模擬訂單', wallets:'測試幣流水', services:'報價與服務', crm:'客戶與商機', projects:'任務與里程碑', manufacturing:'BOM 與製造', administration:'行政工作台'};
const moduleUses:Record<string,string> = {inventory:'管理商品、存貨與模擬進貨', sales:'接單、模擬付款與出貨', wallets:'核對每筆測試幣收支', services:'報價、交付與驗收', crm:'整理客戶、商機與案件', projects:'安排待辦與交付進度', manufacturing:'依配方備料、製作與完工', administration:'練習班表、出勤與行政申請'};
const industryExamples:Record<string,string> = {retail:'選物店、服飾店、生活用品', wholesale:'批發供貨、箱裝商品', service:'設計、維修、顧問服務', restaurant:'咖啡廳、餐飲與飲料店', manufacturing:'工廠、組裝與加工', ecommerce:'網路商店、品牌商品', projects:'工程、專案與交付管理', general:'先用通用功能，再依需求調整'};
const industryIcons:Record<string,IconName> = {retail:'sales', wholesale:'inventory', service:'services', restaurant:'manufacturing', manufacturing:'manufacturing', ecommerce:'sales', projects:'projects', general:'overview'};
const dependencies:Record<string,string[]> = catalog.moduleDependencies;
const moduleOrder = Object.keys(moduleLabels);
const stepTitles = ['店名與行業', '確認推薦功能', '建立我的系統'];
const controls = /[\u0000-\u001f\u007f-\u009f]/;

export function changeBuilderModules(current:string[], id:string, enabled:boolean):string[] {
  const next = new Set(current);
  if (enabled) {
    const add = (key:string) => {if (next.has(key)) return; next.add(key); for (const dependency of dependencies[key] || []) add(dependency);};
    add(id);
  } else {
    next.delete(id);
    let changed = true;
    while (changed) {
      changed = false;
      for (const key of next) if ((dependencies[key] || []).some(dependency => !next.has(dependency))) {next.delete(key); changed = true;}
    }
  }
  return moduleOrder.filter(key => next.has(key));
}

function defaultDraft(defaults?:BuilderDefaults):Draft {
  const template = catalog.templates.find(item => item.id === defaults?.industry) || catalog.templates[0];
  const requested = defaults?.modules;
  const validModules = Array.isArray(requested) && requested.length > 0 && requested.length <= moduleOrder.length && new Set(requested).size === requested.length && requested.every(key => moduleOrder.includes(key)) && requested.every(key => (dependencies[key] || []).every(dependency => requested.includes(dependency)));
  const company = defaults?.public_demo === false && typeof defaults.company_name === 'string' && !controls.test(defaults.company_name) && defaults.company_name.length <= 100 ? defaults.company_name : '';
  return {industry:template.id, company, modules:validModules ? [...requested!] : [...template.modules], destination:'public'};
}

function draftScope(defaults?:BuilderDefaults):string {
  const base = defaultDraft(defaults);
  // Each local launch profile keeps its own draft. Public drafts stay in this browser tab.
  return 'freedom-erp.builder.v2.' + encodeURIComponent(JSON.stringify({mode:defaults?.public_demo === false ? 'local' : 'public', industry:base.industry, modules:base.modules, company:base.company}));
}

function initialDraft(scope:string, defaults?:BuilderDefaults):Draft {
  const base = defaultDraft(defaults);
  try {
    const raw:unknown = JSON.parse(sessionStorage.getItem(scope) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some(key => !['industry','company','modules','destination'].includes(key))) return base;
    const value = raw as Draft;
    if (!catalog.templates.some(template => template.id === value.industry) || typeof value.company !== 'string' || value.company.length > 100 || controls.test(value.company) || !Array.isArray(value.modules) || value.modules.length === 0 || value.modules.length > moduleOrder.length || !value.modules.every(key => typeof key === 'string' && moduleOrder.includes(key)) || new Set(value.modules).size !== value.modules.length || !value.modules.every(key => (dependencies[key] || []).every(dependency => value.modules.includes(dependency))) || !['public','local'].includes(value.destination)) return base;
    return {industry:value.industry, company:value.company, modules:[...value.modules], destination:value.destination};
  } catch {return base;}
}

function downloadFile(bytes:BlobPart, mime:string, filename:string) {
  const url = URL.createObjectURL(new Blob([bytes], {type:mime}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function BuildCenter({workspace, defaults, expiresAt, retentionHours, busy, pending, onCreate, onOpenWorkspace}:{workspace:Workspace|null; defaults?:BuilderDefaults; expiresAt?:string|null; retentionHours?:number|null; busy:boolean; pending:boolean; onCreate:(config:LaunchConfig)=>Promise<boolean>; onOpenWorkspace:()=>void}) {
  const scope = draftScope(defaults);
  const [draftState, setDraftState] = useState(() => ({scope, draft:initialDraft(scope, defaults)}));
  const [step, setStep] = useState(1), [reached, setReached] = useState(1), [notice, setNotice] = useState(''), [localError, setLocalError] = useState(''), [creating, setCreating] = useState(false), [nameTouched, setNameTouched] = useState(false);
  const draft = draftState.draft;
  const submitting = useRef(false), heading = useRef<HTMLHeadingElement>(null), hasMoved = useRef(false);
  const template = catalog.templates.find(item => item.id === draft.industry)!;
  const configResult = useMemo(() => {
    try {return {config:normalizeLaunchConfig({format:'freedom-erp-launch-v1', industry:draft.industry, company_name:draft.company, modules:draft.modules, port:'auto', directory:'./freedom-data', auto_setup:true, simulation:true, real_finance:false}, catalog) as LaunchConfig, error:''};}
    catch (error) {return {config:null, error:(error as Error).message};}
  }, [draft.industry, draft.company, draft.modules]);
  const validName = !!draft.company.trim() && draft.company.length <= 100 && !controls.test(draft.company);
  const config = configResult.config, ready = !!config, locked = busy || pending || creating;
  const command = config ? setupCommand(config) : '', configText = config ? launchConfigText(config) : '';
  const usingRecommended = draft.modules.length === template.modules.length && template.modules.every(id => draft.modules.includes(id));
  const publicRetention = expiresAt ? `停止使用後，試用資料預計於 ${new Date(expiresAt).toLocaleString('zh-TW')} 清除；繼續使用會延長期限。` : retentionHours ? `停止使用 ${retentionHours} 小時後，試用資料會清除。` : '目前為自架工作區，沒有自動清除期限。';

  useEffect(() => {
    if (draftState.scope === scope) return;
    setDraftState({scope, draft:initialDraft(scope, defaults)}); setStep(1); setReached(1); setNameTouched(false); setNotice(''); setLocalError('');
  }, [scope, draftState.scope, defaults]);
  useEffect(() => {if (draftState.scope === scope) {try {sessionStorage.setItem(scope, JSON.stringify(draft));} catch {/* Draft stays usable in memory when browser storage is blocked. */}}}, [scope, draftState.scope, draft]);
  useEffect(() => {if (hasMoved.current) heading.current?.focus(); hasMoved.current = true;}, [step]);

  function update(partial:Partial<Draft>) {setDraftState(current => ({...current, draft:{...current.draft, ...partial}})); setNotice(''); setLocalError('');}
  function selectIndustry(id:string) {const selected = catalog.templates.find(item => item.id === id)!; update({industry:id, modules:[...selected.modules]});}
  function move(next:number) {
    if (locked || next > 1 && !validName || next === 3 && !ready) return;
    setStep(next); setReached(current => Math.max(current, next)); setNotice(''); setLocalError('');
  }
  function toggle(id:string, enabled:boolean) {
    const next = changeBuilderModules(draft.modules, id, enabled);
    const changed = moduleOrder.filter(key => key !== id && draft.modules.includes(key) !== next.includes(key));
    update({modules:next});
    if (changed.length) setNotice(`${enabled ? '一併啟用' : '一併關閉'}：${changed.map(key => moduleLabels[key]).join('、')}。`);
  }
  async function create() {
    if (!config || locked || workspace || submitting.current) return;
    submitting.current = true; setCreating(true); setNotice(''); setLocalError('');
    try {if (!await onCreate(config)) setLocalError('尚未完成建立，請查看上方操作訊息後再試。');}
    catch (error) {setLocalError((error as Error).message);}
    finally {submitting.current = false; setCreating(false);}
  }
  async function copyCommand() {
    try {await navigator.clipboard.writeText(command); setNotice('已複製啟動指令。');}
    catch {setLocalError('無法自動複製，請在指令欄位選取並複製文字。');}
  }
  function download(kind:'kit'|'config') {
    if (!config || locked) return;
    try {
      if (kind === 'kit') downloadFile(buildLaunchKit(config, schemaSource).slice().buffer, 'application/zip', 'freedom-launch-kit.zip');
      else downloadFile(configText, 'application/json;charset=utf-8', 'freedom-launch.json');
      setNotice(kind === 'kit' ? '已下載一鍵建置包。解壓縮後開啟 start.cmd（Windows）或依包內說明啟動，即可進入你的系統。' : '已下載設定檔。請放在自己的系統資料夾，使用下方啟動指令。'); setLocalError('');
    } catch (error) {setLocalError((error as Error).message);}
  }

  return <section className="build-center" data-testid="build-center" aria-label="快速上手建置系統">
    <div className="build-intro">
      <div><span className="eyebrow">自由 ERP CRM · 引導建置</span><h1>從這裡，建立你的第一套系統。</h1><p>填店名、選行業，我們幫你配好功能。建立後，直接進入你的工作台。</p></div>
      <div className="build-mode-stamp"><Icon name="plus"/><span>3 步建立</span><small>免安裝即可試用</small></div>
    </div>
    {workspace && <div className="build-preserved"><Icon name="pin"/><p>「{workspace.company_name}」已保留。這裡可以規劃另一套本機系統，或<button type="button" disabled={locked} onClick={onOpenWorkspace}>回到目前工作區</button>。</p></div>}
    <nav className="build-stepper" aria-label="建置步驟"><ol>{stepTitles.map((title, index) => <li key={title} className={step === index + 1 ? 'is-current' : step > index + 1 ? 'is-complete' : ''}><button type="button" data-testid={`build-step-${index+1}`} aria-label={`前往步驟 ${index+1}：${title}`} aria-current={step === index + 1 ? 'step' : undefined} disabled={locked || index + 1 > reached || index > 0 && !validName || index === 2 && !ready} onClick={() => move(index + 1)}><span aria-hidden>{step > index + 1 ? '✓' : index + 1}</span><strong>{title}</strong></button></li>)}</ol></nav>
    <div className="build-layout"><div className="build-workbench">
      <div className="build-section-heading"><span>步驟 {step}／3</span><h2 ref={heading} tabIndex={-1}>{stepTitles[step-1]}</h2><p>{step === 1 ? '先告訴我們你的店家或企業名稱，再選最接近的行業。' : step === 2 ? '適合這個行業的功能已選好。可以直接下一步，也能加減調整。' : '確認下面的系統摘要，就可以開始使用。'}</p></div>
      {step === 1 && <>
        <label className="build-company">店名／工作室名稱<input data-testid="build-company" value={draft.company} placeholder="例如：自由咖啡館" autoComplete="organization" maxLength={100} disabled={locked} required aria-invalid={nameTouched && !validName ? true : undefined} aria-describedby="build-company-note" onBlur={() => setNameTouched(true)} onChange={event => {setNameTouched(true); update({company:event.target.value});}}/></label>
        <p id="build-company-note" className="build-field-note">這個名字會顯示在你的工作台，最多 100 字。</p>
        {nameTouched && !validName && <p className="build-validation" role="alert">{!draft.company.trim() ? '請填入店名／工作室名稱。' : '名稱不能包含控制字元，請重新輸入。'}</p>}
        <fieldset className="build-industry"><legend>你的店家或企業屬於哪一類？</legend><p className="build-field-note">選最接近的一種即可，下一步還能調整功能。</p><div className="build-template-grid" role="group" aria-label="產業範本">{catalog.templates.map(item => <button type="button" key={item.id} data-testid={`build-template-${item.id}`} className={draft.industry === item.id ? 'build-template is-selected' : 'build-template'} aria-pressed={draft.industry === item.id} disabled={locked} onClick={() => selectIndustry(item.id)}><Icon name={industryIcons[item.id]}/><span className="build-template-copy"><strong>{item.name}</strong><small>{industryExamples[item.id]}</small></span><span className="build-template-check" aria-hidden>{draft.industry === item.id ? '✓' : ''}</span></button>)}</div></fieldset>
      </>}
      {step === 2 && <>
        <div className="build-recommendation"><Icon name={industryIcons[draft.industry]}/><div><strong>{template.name} · {usingRecommended ? '推薦功能已選好' : '使用自訂功能'}</strong><p>已選 {draft.modules.length} 個功能。建立時會附上模擬示範資料。</p></div><button type="button" data-testid="build-restore-recommended" disabled={locked || usingRecommended} onClick={() => {update({modules:[...template.modules]}); setNotice('已恢復這個行業的推薦功能。');}}>恢復推薦功能</button></div>
        <fieldset className="build-modules"><legend>要加入哪些功能？</legend><div className="build-module-grid">{moduleOrder.map(id => <label key={id} className={draft.modules.includes(id) ? 'is-selected' : ''}><input type="checkbox" data-testid={`build-module-${id}`} checked={draft.modules.includes(id)} disabled={locked} aria-describedby="build-module-note" onChange={event => toggle(id, event.target.checked)}/><span><strong>{moduleLabels[id]}</strong><small>{moduleUses[id]}</small></span></label>)}</div><p className="build-field-note" id="build-module-note">需要一起使用的功能會自動勾選；取消必要功能時，相關功能也會一併取消。</p></fieldset>
        {!ready && <p className="build-validation" role="alert">{!draft.modules.length ? '請至少保留一個功能。' : configResult.error}</p>}
        <details className="build-detail-note"><summary>這個行業範本包含什麼？</summary><p>{template.purpose}。只提供已實作的模擬流程，範例商品、客戶與設定可在工作台調整。</p><p>行政功能使用模擬員工與資料。正式薪資、報稅、發票、銀行與多人權限尚未提供。</p></details>
      </>}
      {step === 3 && <>
        <div className="build-final-summary" data-testid="build-final-summary"><span className="build-summary-icon"><Icon name={industryIcons[draft.industry]}/></span><div><small>準備建立</small><h3>{draft.company.trim()}</h3><p>{template.name} · {draft.modules.length} 個功能</p></div><span className="build-sim-pill">SIM 模擬系統</span></div>
        <fieldset className="build-destinations"><legend>選擇開始方式</legend><label className={draft.destination === 'public' ? 'is-selected' : ''}><input type="radio" name="build-destination" value="public" data-testid="build-destination-public" checked={draft.destination === 'public'} disabled={locked} onChange={() => update({destination:'public'})}/><span><strong>直接在瀏覽器開始 <em>推薦新手</em></strong><small>不用安裝，每位訪客有獨立模擬工作區。</small></span></label><label className={draft.destination === 'local' ? 'is-selected' : ''}><input type="radio" name="build-destination" value="local" data-testid="build-destination-local" checked={draft.destination === 'local'} disabled={locked} onChange={() => update({destination:'local'})}/><span><strong>下載到我的電腦</strong><small>資料保存在自己的資料夾。需要 Node.js 24 與 Git。</small></span></label></fieldset>
        {draft.destination === 'public' ? <div className="build-start-panel">
          {workspace ? <div className="build-existing" data-testid="build-existing"><h3>這個瀏覽器已有工作區</h3><p>「{workspace.company_name}」的模擬資料已保留。要建立另一套系統，可以下載本機建置包。</p><div className="build-inline-actions"><button type="button" className="primary" data-testid="build-existing-open" disabled={locked} onClick={onOpenWorkspace}>回到目前工作區 <Icon name="arrow"/></button><button type="button" disabled={locked} onClick={() => update({destination:'local'})}>下載另一套本機系統</button></div></div> : <><h3>你的工作台準備好了</h3><p>按下建立後會載入示範資料，並帶你完成第一個設定。你可以直接操作，也能隨時查看教學。</p><button type="button" className="primary build-create" data-testid="build-create" disabled={locked || !ready} onClick={() => void create()}>{creating || busy ? '建立中…' : '建立我的系統'}<Icon name="arrow"/></button></>}
          <p className="build-field-note">{publicRetention} 重要資料請匯出備份。</p>
        </div> : <div className="build-start-panel build-local"><h3>下載後，開啟啟動檔就能使用</h3><p>一份 ZIP 包含設定與啟動檔。解壓縮到自己的系統資料夾後，Windows 開啟 start.cmd；macOS／Linux 依包內說明啟動。</p><button type="button" className="primary" data-testid="build-download-kit" disabled={locked || !ready} onClick={() => download('kit')}>下載一鍵建置包 ZIP <Icon name="arrow"/></button><p className="build-field-note">同一份啟動檔與瀏覽器可以接續原模擬工作區。模擬資料沒有自動清除期限，請保留資料夾並定期備份。</p>
          <details className="build-detail-note"><summary>本機啟動說明與環境準備</summary><ol><li>安裝 <a href="https://nodejs.org/en/download" target="_blank" rel="noreferrer">Node.js 24 以上</a>與 <a href="https://git-scm.com/downloads" target="_blank" rel="noreferrer">Git</a>，首次下載需要網路。</li><li>解壓縮建置包，Windows 雙擊 start.cmd；macOS／Linux 在該資料夾執行 <code>sh start.sh</code>。</li><li>啟動後會選擇可用連接埠，並開啟已配置的工作區。重啟時請使用原資料夾與瀏覽器。</li></ol><p>資料保存在建置包旁的 <code>freedom-data</code>。設定不符時會拒絕覆寫既有實例，建立另一套請使用新資料夾。不同瀏覽器有不同訪客資料；跨裝置同步尚未提供。</p></details>
          <details className="build-source"><summary>進階設定與啟動指令</summary><label>在建置包資料夾執行<input data-testid="build-command" value={command} readOnly onFocus={event => event.target.select()}/></label><div className="build-inline-actions"><button type="button" data-testid="build-copy-command" disabled={locked} onClick={() => void copyCommand()}>複製啟動指令</button><button type="button" data-testid="build-download-config" disabled={locked || !ready} onClick={() => download('config')}>下載設定 JSON</button></div><pre aria-label="建置設定 JSON">{configText}</pre><p>程式碼採 MIT 授權，可從 <a href="https://github.com/mars-tw/freedom-erp-crm" target="_blank" rel="noreferrer">GitHub 專案</a>查看與修改。</p></details>
        </div>}
      </>}
      {pending && <p className="build-validation" role="alert">上次操作尚未確認。請使用上方「確認原操作結果」，確認後即可繼續。</p>}
      {notice && <div className="build-feedback" role="status">{notice}</div>}{localError && <div className="build-validation" role="alert">{localError}</div>}
      <div className="build-step-actions">{step > 1 ? <button type="button" data-testid="build-back" disabled={locked} onClick={() => move(step - 1)}>上一步</button> : <span>下一步，會幫你選好適合的功能。</span>}{step < 3 && <button type="button" className="primary" data-testid="build-next" disabled={locked || step === 1 && !validName || step === 2 && !ready} onClick={() => move(step + 1)}>{step === 1 ? '下一步：確認功能' : '下一步：預覽系統'}<Icon name="arrow"/></button>}</div>
    </div><aside className="build-plan" data-testid="build-plan" aria-label="我的系統摘要"><div className="build-plan-header"><span>你的系統，正在成形</span><Icon name="overview"/></div><h3>{draft.company.trim() || '先為你的系統取個名字'}</h3><dl><div><dt>行業</dt><dd>{template.name}</dd></div><div><dt>開始方式</dt><dd>{draft.destination === 'public' ? '瀏覽器直接使用' : '自己的電腦'}</dd></div><div><dt>已選功能</dt><dd>{draft.modules.length} 個</dd></div></dl><ul className="build-plan-modules">{moduleOrder.filter(id => draft.modules.includes(id)).map(id => <li key={id}><Icon name={id as IconName}/>{moduleLabels[id]}</li>)}</ul><div className="build-plan-footer"><span>SIM</span><p>使用模擬商品與測試幣。<br/>正式財務、發票與銀行尚未接入。</p></div><p className="build-plan-tip">建立前可以自由調整。<br/>只有按下「建立我的系統」才會建立瀏覽器工作區。</p></aside></div>
  </section>;
}
