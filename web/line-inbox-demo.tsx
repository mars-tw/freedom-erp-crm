import {useEffect, useMemo, useState} from 'react';
import type {FormEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {Icon, type IconName} from './icons';
import './line-inbox-demo.css';

type SourceType = 'private' | 'group' | 'openchat';
type QuadrantKey = 'important_urgent' | 'urgent_not_important' | 'not_important_not_urgent' | 'important_not_urgent';
type NavKey = 'overview' | 'inbox' | 'quadrants' | 'tasks' | 'settings';
type Role = 'fish' | 'family' | 'branch_admin';

type InboxItem = {
  id: string;
  conversationType: SourceType;
  sender: string;
  sourceName: string;
  maskedSummary: string;
  receivedAt: number;
  quadrant: QuadrantKey | null;
  suggestedQuadrant: QuadrantKey | null;
  confidence: number;
  reviewReason: string | null;
  reviewQueue: boolean;
  attachment?: {name: string; type: string; available: boolean; link?: string};
  syncState: string;
};

type Task = {
  id: string;
  title: string;
  dueAt: string | null;
  assignee: string;
  status: '待處理' | '進行中' | '完成';
  notes: string;
  sourceSummary: string;
  createdAt: string;
  completedAt: string | null;
};

type Draft = {id: string; messageId: string; conversationType: SourceType; recipient: string; channel: string; body: string; status: string; attachment?: InboxItem['attachment']};
type Candidate = {id: string; messageId: string; title: string; assignee: string; dueAt: string | null; sourceSummary: string; status: string};
type DashboardData = {role: Role; version: number; items: InboxItem[]; summary: Record<QuadrantKey | 'review', number>; reviewQueue: InboxItem[]; tasks: Task[]; taskCandidates?: Candidate[]; drafts?: Draft[]; classificationPreferences?: Array<{id: string; pattern: SourceType; quadrant: QuadrantKey; updatedAt: string}>; sync: {state: string; lastSuccessfulAt: string | null; lastError: string | null; backfillCompleted: number; backfillRemaining: number; backfillBatchSize: number}; backup: {adapter: string; state: string; queueCount: number; versions: Array<{id: string; createdAt: string; bytes: number; scope: string}>; lastSuccessfulAt: string | null}; notifications?: Array<{id: string; summary: string; href: string}>};

const sourceLabels: Record<SourceType, string> = {private: '一對一', group: '一般群組', openchat: 'LINE 社群'};
const quadrantMeta: Record<QuadrantKey, {label: string; short: string; tone: string; description: string}> = {
  important_urgent: {label: '重要且緊急', short: '現在處理', tone: 'coral', description: '需要你現在做決定或回覆'},
  important_not_urgent: {label: '重要但不緊急', short: '排時間', tone: 'green', description: '值得保留時間完成'},
  urgent_not_important: {label: '緊急但不重要', short: '快速處理', tone: 'amber', description: '先用簡短方式清掉'},
  not_important_not_urgent: {label: '不重要且不緊急', short: '稍後整理', tone: 'slate', description: '先收好，不打斷現在的事'},
};
const quadrantKeys = Object.keys(quadrantMeta) as QuadrantKey[];
const navItems: Array<{id: NavKey; label: string; icon: IconName}> = [
  {id: 'overview', label: '總覽', icon: 'overview'},
  {id: 'inbox', label: '待處理收件匣', icon: 'search'},
  {id: 'quadrants', label: '四象限', icon: 'reports'},
  {id: 'tasks', label: '已核准待辦', icon: 'projects'},
  {id: 'settings', label: '連接與備份', icon: 'settings'},
];

class ApiError extends Error { constructor(public code: string, public status: number, message: string) {super(message);} }
const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const formatDate = (value: number | string | null) => value ? new Intl.DateTimeFormat('zh-TW', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'}).format(new Date(value)) : '尚未設定';

function App() {
  const [screen, setScreen] = useState<'loading' | 'bootstrap' | 'login' | 'reset' | 'reset-complete' | 'app'>('loading');
  const [csrf, setCsrf] = useState('');
  const [version, setVersion] = useState(0);
  const [account, setAccount] = useState<{email: string; display_name: string; role: Role} | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [formError, setFormError] = useState('');
  const [formNotice, setFormNotice] = useState('');
  const [toast, setToast] = useState('');

  const notify = (message: string) => {setToast(message);window.setTimeout(() => setToast(''), 2600);};
  const request = async (path: string, options: {method?: 'GET' | 'POST'; body?: Record<string, unknown>; version?: number} = {}) => {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = {};
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      headers['Origin'] = window.location.origin;
      headers['x-csrf-token'] = csrf;
      headers['Idempotency-Key'] = newKey();
      headers['If-Match-Version'] = String(options.version ?? version);
    }
    const response = await fetch(path, {method, credentials: 'same-origin', headers, body: method === 'POST' ? JSON.stringify(options.body ?? {}) : undefined});
    const data: any = await response.json().catch(() => ({}));
    if (typeof data.csrf === 'string') setCsrf(data.csrf);
    if (typeof data.version === 'number') setVersion(data.version);
    if (!response.ok) throw new ApiError(data.error?.code ?? 'request_failed', response.status, data.error?.message ?? '操作未完成');
    return data as any;
  };

  const loadBootstrap = async () => {
    try {const data = await request('/api/line-auth/bootstrap');setScreen(data.initialized ? 'login' : 'bootstrap');}
    catch (error) {setFormError(error instanceof Error ? error.message : '無法讀取家庭中台。');setScreen('login');}
  };
  const loadDashboard = async () => {
    const data = await request('/api/line-inbox');setDashboard(data);setScreen('app');
  };
  useEffect(() => {void loadBootstrap();}, []);

  const bootstrap = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();setFormError('');setFormNotice('');const form = new FormData(event.currentTarget);const email = String(form.get('email') ?? '');
    try {await request('/api/line-auth/bootstrap', {method: 'POST', body: {email, password: String(form.get('password') ?? ''), display_name: String(form.get('display_name') ?? 'Fish')}});setLoginEmail(email);setFormNotice('Fish 管理員已建立，接著登入家庭中台。');setScreen('login');}
    catch (error) {setFormError(error instanceof Error ? error.message : '建立失敗。');}
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();setFormError('');setFormNotice('');const form = new FormData(event.currentTarget);const email = String(form.get('email') ?? '');
    try {const result = await request('/api/line-auth/login', {method: 'POST', body: {email, password: String(form.get('password') ?? ''), device_name: '瀏覽器'}});setAccount(result.account);await loadDashboard();notify(result.account.role === 'fish' ? '已進入 Fish 完整工作台。' : '已進入家人協作檢視。');}
    catch (error) {setFormError(error instanceof Error ? error.message : '登入失敗。');}
  };
  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();setFormError('');setFormNotice('');const form = new FormData(event.currentTarget);const email = String(form.get('email') ?? '');
    try {await request('/api/line-auth/password-reset/request', {method: 'POST', body: {email}});setLoginEmail(email);setFormNotice('已建立 15 分鐘一次性 Email outbox 連結。');setScreen('login');}
    catch (error) {setFormError(error instanceof Error ? error.message : '無法建立重設連結。');}
  };
  const completeReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();setFormError('');setFormNotice('');const form = new FormData(event.currentTarget);
    try {await request('/api/line-auth/password-reset/complete', {method: 'POST', body: {token: String(form.get('token') ?? ''), password: String(form.get('password') ?? '')}});setLoginEmail('');setFormNotice('密碼已重設，請用新密碼重新登入。');setScreen('login');}
    catch (error) {setFormError(error instanceof Error ? error.message : '無法完成密碼重設。');}
  };
  const logout = async () => {try {await request('/api/line-auth/logout', {method: 'POST'});} catch {} setAccount(null);setDashboard(null);setScreen('login');setFormError('');setFormNotice('');};

  if (screen === 'loading') return <div className="line-auth-shell"><div className="line-auth-card"><span className="demo-eyebrow">LINE 個人訊息 AI 中台</span><h1>正在讀取家庭工作區</h1><p>建立獨立的家庭工作階段與假資料環境。</p></div></div>;
  if (screen === 'bootstrap') return <AuthForm mode="bootstrap" error={formError} notice={formNotice} onSubmit={bootstrap}/>;
  if (screen === 'login') return <AuthForm mode="login" email={loginEmail} error={formError} notice={formNotice} onForgot={() => {setFormError('');setFormNotice('');setScreen('reset');}} onComplete={() => {setFormError('');setFormNotice('');setScreen('reset-complete');}} onSubmit={login}/>;
  if (screen === 'reset') return <AuthForm mode="reset" error={formError} notice={formNotice} onBack={() => {setFormError('');setFormNotice('');setScreen('login');}} onComplete={() => {setFormError('');setFormNotice('');setScreen('reset-complete');}} onSubmit={resetPassword}/>;
  if (screen === 'reset-complete') return <AuthForm mode="reset-complete" error={formError} notice={formNotice} onBack={() => {setFormError('');setFormNotice('');setScreen('login');}} onSubmit={completeReset}/>;
  return dashboard && account ? <Dashboard account={account} data={dashboard} request={request} onRefresh={loadDashboard} onLogout={logout} notify={notify} toast={toast}/> : null;
}

function AuthForm({mode, email = '', error, notice, onSubmit, onForgot, onBack, onComplete}:{mode:'bootstrap'|'login'|'reset'|'reset-complete';email?:string;error:string;notice:string;onSubmit:(event:FormEvent<HTMLFormElement>)=>void;onForgot?:()=>void;onBack?:()=>void;onComplete?:()=>void}) {
  if (mode === 'reset') return <div className="line-auth-shell"><form className="line-auth-card" onSubmit={onSubmit}><span className="demo-eyebrow">家庭帳號</span><h1>重設家人密碼</h1><p>測試 Email outbox 會建立 15 分鐘、只能使用一次的連結。</p><label htmlFor="reset-email">重設 Email</label><input id="reset-email" name="email" type="email" required autoComplete="email"/><button className="demo-button primary" type="submit">寄出重設連結</button>{error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="auth-success" role="status">{notice}</p>}<button className="text-link" type="button" onClick={onComplete}>我有重設連結</button><button className="text-link" type="button" onClick={onBack}>回到登入</button></form></div>;
  if (mode === 'reset-complete') return <div className="line-auth-shell"><form className="line-auth-card" onSubmit={onSubmit}><span className="demo-eyebrow">模擬 Email outbox</span><h1>使用重設連結</h1><p>貼上 Fish 從測試 outbox 取得的 token；連結 15 分鐘內只能使用一次。</p><label htmlFor="reset-token">重設連結 token</label><input id="reset-token" name="token" type="text" required autoComplete="off"/><label htmlFor="new-password">新密碼</label><input id="new-password" name="password" type="password" minLength={8} required autoComplete="new-password"/><button className="demo-button primary" type="submit">完成密碼重設</button>{error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="auth-success" role="status">{notice}</p>}<button className="text-link" type="button" onClick={onBack}>回到登入</button></form></div>;
  return <div className="line-auth-shell"><form className="line-auth-card" onSubmit={onSubmit}><div className="auth-brand"><div className="demo-brand-mark"><Icon name="search"/></div><div><strong>LINE 收件匣</strong><span>家庭 AI 工作台</span></div></div><span className="demo-eyebrow">家庭內網 · 模擬第一里程碑</span><h1>{mode === 'bootstrap' ? '建立家庭中台' : '登入家庭中台'}</h1><p>{mode === 'bootstrap' ? '第一次使用只建立一個 Fish 管理員；家人帳號是固定假資料，供權限驗收。' : 'Fish 可以檢查完整流程，家人只看遮罩摘要與已核准待辦。'}</p>{mode === 'bootstrap' ? <><label htmlFor="admin-email">管理員 Email</label><input id="admin-email" name="email" type="email" required autoComplete="email"/><label htmlFor="admin-name">管理員名稱</label><input id="admin-name" name="display_name" defaultValue="Fish" required/><label htmlFor="admin-password">管理員密碼</label><input id="admin-password" name="password" type="password" minLength={8} required autoComplete="new-password"/><button className="demo-button primary" type="submit">建立 Fish 管理員</button></> : <><label htmlFor="login-email">Email</label><input id="login-email" name="email" type="email" defaultValue={email} required autoComplete="email"/><label htmlFor="login-password">密碼</label><input id="login-password" name="password" type="password" required autoComplete="current-password"/><button className="demo-button primary" type="submit">登入</button>{onForgot && <button className="text-link" type="button" onClick={onForgot}>忘記密碼</button>}{onComplete && <button className="text-link" type="button" onClick={onComplete}>使用重設連結</button>}</>}{error && <p className="auth-error" role="alert">{error}</p>}{notice && <p className="auth-success" role="status">{notice}</p>}<small className="auth-boundary">不連接真實 LINE、AI Provider、Email delivery 或 Google Drive。</small></form></div>;
}

function Dashboard({account,data,request,onRefresh,onLogout,notify,toast}:{account:{email:string;display_name:string;role:Role};data:DashboardData;request:(path:string,options?:{method?:'GET'|'POST';body?:Record<string,unknown>;version?:number})=>Promise<any>;onRefresh:()=>Promise<void>;onLogout:()=>Promise<void>;notify:(message:string)=>void;toast:string}) {
  const [activeNav,setActiveNav] = useState<NavKey>('overview');
  const [selectedId,setSelectedId] = useState(data.items[0]?.id ?? '');
  const [query,setQuery] = useState('');
  const [sourceFilter,setSourceFilter] = useState<'all'|SourceType>('all');
  const selected = data.items.find(item => item.id === selectedId) ?? data.items[0];
  const filtered = useMemo(() => data.items.filter(item => (sourceFilter === 'all' || item.conversationType === sourceFilter) && (!query.trim() || `${item.sender} ${item.sourceName} ${item.maskedSummary}`.toLowerCase().includes(query.trim().toLowerCase()))), [data.items,query,sourceFilter]);
  useEffect(() => {if (!selected && data.items[0]) setSelectedId(data.items[0].id);}, [data.items,selected]);
  const act = async (path:string, body:Record<string,unknown>, success:string) => {try {await request(path, {method:'POST', body});await onRefresh();notify(success);} catch (error) {notify(error instanceof Error ? error.message : '操作未完成。');}};
  const confirm = () => selected && act(`/api/line-inbox/${selected.id}/classification`, {quadrant: selected.suggestedQuadrant ?? 'important_not_urgent'}, '已確認分類，訊息離開待確認佇列。');
  const approve = () => {const candidate=data.taskCandidates?.find(item => item.messageId === selected?.id && item.status === 'pending');if(candidate) void act(`/api/line-inbox/task-candidates/${candidate.id}/approve`, {}, '已核准待辦，家人可以協作。');};
  const toggleTask = (task:Task) => void act(`/api/line-inbox/tasks/${task.id}`, {status: task.status === '完成' ? '待處理' : '完成'}, '待辦狀態已更新。');
  const renderContent = () => {
    if (activeNav === 'settings') return account.role === 'fish' ? <SettingsView data={data} act={act} notify={notify}/> : <FamilyBoundaryView/>;
    if (activeNav === 'tasks') return <TaskView data={data} role={account.role} onToggle={toggleTask}/>;
    if (activeNav === 'inbox') return <section className="task-page inbox-page"><div className="page-title-block"><span className="demo-eyebrow">訊息整理</span><h1>待處理收件匣</h1><p>先看低信心分類，再決定哪些訊息需要你親自回應。</p></div><div className="demo-work-grid"><InboxPanel items={filtered} selectedId={selected?.id ?? ''} sourceFilter={sourceFilter} query={query} onFilter={setSourceFilter} onQuery={setQuery} onSelect={setSelectedId}/><MessageDetail item={selected} role={account.role} candidate={data.taskCandidates?.find(candidate => candidate.messageId === selected?.id && candidate.status === 'pending')} draft={data.drafts?.find(draft => draft.messageId === selected?.id)} onConfirm={confirm} onApprove={approve} onAct={act}/></div></section>;
    if (activeNav === 'quadrants') return <section className="task-page"><div className="page-title-block"><span className="demo-eyebrow">分類整理</span><h1>四象限</h1><p>待確認佇列獨立顯示，不會變成第五個象限。</p></div><QuadrantBoard items={data.items} onSelect={setSelectedId} fullPage/></section>;
    return <><section className="demo-welcome"><div><span className="demo-eyebrow">家庭 LINE 工作台 · simulated fake data</span><h1>今天先處理真正重要的事</h1><p>AI 先整理訊息，你只需要確認真正需要回應的事情。</p></div><div className="welcome-actions"><button className="demo-button secondary" onClick={() => setActiveNav('inbox')}><Icon name="search"/>查看待確認</button><button className="demo-button primary" onClick={() => notify('規則式 AI adapter 目前固定使用假資料。')}><Icon name="plus"/>查看模擬規則</button></div></section><MetricStrip data={data}/><CapabilityStrip data={data}/>{account.role === 'fish' && <NotificationPanel notifications={data.notifications ?? []} onSelect={setSelectedId}/>}<section className="demo-work-grid"><InboxPanel items={filtered} selectedId={selected?.id ?? ''} sourceFilter={sourceFilter} query={query} onFilter={setSourceFilter} onQuery={setQuery} onSelect={setSelectedId}/><MessageDetail item={selected} role={account.role} candidate={data.taskCandidates?.find(candidate => candidate.messageId === selected?.id && candidate.status === 'pending')} draft={data.drafts?.find(draft => draft.messageId === selected?.id)} onConfirm={confirm} onApprove={approve} onAct={act}/></section><section className="demo-section-block"><SectionHeading title="四象限摘要" action="查看完整看板" onAction={() => setActiveNav('quadrants')}/><QuadrantBoard items={data.items} onSelect={setSelectedId}/></section><section className="demo-section-block"><SectionHeading title="已核准待辦" action="查看全部待辦" onAction={() => setActiveNav('tasks')}/><TaskPreview tasks={data.tasks} onToggle={toggleTask}/></section></>;
  };
  const syncLabel = data.sync.state === 'offline' ? '離線' : data.sync.state === 'backfilling' ? '補同步中' : data.sync.state === 'paused' ? '同步已暫停' : '背景同步中';
  const visibleNavItems = navItems.filter(item => account.role === 'fish' || item.id !== 'settings');
  return <div className="line-demo-shell"><header className="demo-topbar"><div className="demo-brand-lockup"><div className="demo-brand-mark" aria-hidden="true"><Icon name="search"/></div><div><strong>LINE 收件匣</strong><span>家庭 AI 工作台</span></div></div><div className="demo-top-actions"><span className={`sync-status ${data.sync.state === 'online' ? 'is-live' : 'is-paused'}`}><i aria-hidden="true"/>{syncLabel}</span><span className="role-chip">{account.role === 'fish' ? 'Fish 完整檢視' : account.role === 'branch_admin' ? '分會管理員檢視' : '家人檢視'}</span><button className="demo-icon-button" onClick={() => void onLogout()}>登出</button></div></header><div className="demo-app-body"><aside className="demo-sidebar"><div className="demo-workspace-switcher"><span className="demo-label">目前工作區</span><strong>Fish 的家庭收件匣</strong><small>1 個 LINE 帳號 · 假資料</small></div><nav aria-label="主要功能"><span className="demo-nav-label">工作台</span>{visibleNavItems.map(item => <button key={item.id} className={`demo-nav-item ${activeNav === item.id ? 'is-active' : ''}`} onClick={() => setActiveNav(item.id)}><Icon name={item.icon}/><span>{item.label}</span>{item.id === 'inbox' && data.summary.review > 0 && <b>{data.summary.review}</b>}</button>)}</nav><div className="demo-sidebar-footer"><span className="demo-label">資料邊界</span><p>原始訊息留在 Mac mini。家人只看摘要與已核准待辦。</p>{account.role === 'fish' && <button className="text-link" onClick={() => setActiveNav('settings')}>查看連接與備份 <Icon name="arrow"/></button>}</div></aside><main className="demo-main">{account.role !== 'fish' && <div className="family-banner"><Icon name="overview"/><span><strong>{account.role === 'branch_admin' ? '分會管理員檢視' : '家人檢視'}</strong> 原始訊息、回覆草稿與分類操作已隱藏。</span></div>}{renderContent()}<footer className="demo-footer"><span>第一里程碑 · 所有內容皆為固定假資料</span><span>尚未連接真實 LINE、AI 或 Google Drive</span></footer></main></div>{toast && <div className="demo-toast" role="status"><Icon name="check" className="toast-check"/>{toast}</div>}</div>;
}

function MetricStrip({data}:{data:DashboardData}) {return <section className="demo-metrics" aria-label="工作台摘要"><div className="demo-metric metric-review"><span>待確認</span><strong data-testid="review-count">{data.summary.review}</strong><small>需要你看一眼</small></div><div className="demo-metric metric-urgent"><span>重要且緊急</span><strong data-testid="important-urgent-count">{data.summary.important_urgent}</strong><small>現在處理</small></div><div className="demo-metric"><span>今日已整理</span><strong>{data.items.length}</strong><small>固定假資料</small></div><div className="demo-metric metric-backup"><span>備份 Adapter</span><strong>{data.backup.state === 'simulated' ? '模擬中' : data.backup.state}</strong><small>{data.backup.queueCount ? `${data.backup.queueCount} 筆待重試` : '本機加密版本'}</small></div></section>;}
function CapabilityStrip({data}:{data:DashboardData}) {return <section className="capability-strip" aria-label="整合能力狀態"><div><span>LINE Connector</span><strong>simulated</strong><small>private · group · openchat</small></div><div><span>AI 分類</span><strong>simulated</strong><small>規則式四象限</small></div><div><span>Email</span><strong>simulated</strong><small>只建立 outbox</small></div><div><span>Google Drive</span><strong>{data.backup.state === 'error' ? 'error' : 'simulated'}</strong><small>{data.backup.state === 'error' ? '備份佇列待重試' : '本機先加密'}</small></div><div><span>OpenChat 回覆</span><strong>disabled</strong><small>等待隔離測試</small></div></section>;}
function NotificationPanel({notifications,onSelect}:{notifications:Array<{id:string;summary:string;href:string}>;onSelect:(id:string)=>void}) {return <section className="demo-section-block notification-panel" aria-labelledby="notification-title">{notifications.length ? <SectionHeading title="重要通知 · simulated" action="查看收件匣" onAction={() => onSelect(notifications[0].href.split('#inbox-')[1] ?? '')}/> : <div className="demo-section-heading"><div><h2>重要通知 · simulated</h2><span>固定假資料 · 可操作流程</span></div></div>}{notifications.length ? <div className="notification-list">{notifications.map(item => <button key={item.id} onClick={() => onSelect(item.href.split('#inbox-')[1] ?? '')}><Icon name="overview"/><span><strong>只通知 Fish</strong><small>{item.summary}</small></span><Icon name="arrow"/></button>)}</div> : <div className="notification-empty"><Icon name="overview"/><span>目前沒有新的重要且緊急通知。</span></div>}</section>;}
function SectionHeading({title,action,onAction}:{title:string;action:string;onAction:()=>void}) {return <div className="demo-section-heading"><div><h2>{title}</h2><span>固定假資料 · 可操作流程</span></div><button className="text-link" onClick={onAction}>{action}<Icon name="arrow"/></button></div>;}
function InboxPanel({items,selectedId,sourceFilter,query,onFilter,onQuery,onSelect}:{items:InboxItem[];selectedId:string;sourceFilter:'all'|SourceType;query:string;onFilter:(value:'all'|SourceType)=>void;onQuery:(value:string)=>void;onSelect:(id:string)=>void}) {return <section className="demo-panel inbox-panel" aria-labelledby="inbox-title"><div className="panel-heading"><div><span className="panel-kicker">待處理</span><h2 id="inbox-title">收件匣</h2></div><span className="panel-count">{items.length} 則</span></div><div className="inbox-tools"><label className="search-field"><Icon name="search"/><span className="sr-only">搜尋訊息</span><input aria-label="搜尋訊息" value={query} onChange={event => onQuery(event.target.value)} placeholder="搜尋人名或內容"/></label><select aria-label="篩選訊息來源" value={sourceFilter} onChange={event => onFilter(event.target.value as 'all'|SourceType)}><option value="all">全部來源</option><option value="private">一對一</option><option value="group">一般群組</option><option value="openchat">LINE 社群</option></select></div><div className="message-list">{items.map(item => <MessageRow key={item.id} item={item} selected={item.id === selectedId} onClick={() => onSelect(item.id)}/>)}</div>{!items.length && <div className="demo-empty"><Icon name="search"/><strong>找不到符合的訊息</strong><span>換個關鍵字或清除來源篩選。</span></div>}</section>;}
function MessageRow({item,selected,onClick}:{item:InboxItem;selected:boolean;onClick:()=>void}) {const quadrant=item.quadrant ?? item.suggestedQuadrant ?? 'not_important_not_urgent';const meta=quadrantMeta[quadrant];return <button className={`message-row ${selected ? 'is-selected' : ''}`} onClick={onClick} aria-pressed={selected} aria-label={`${item.sender} ${sourceLabels[item.conversationType]} ${item.maskedSummary}`}><span className={`message-avatar source-${item.conversationType}`}>{item.sender.slice(0,1)}</span><span className="message-row-body"><span className="message-row-top"><strong>{item.sender}</strong><time>{formatDate(item.receivedAt)}</time></span><span className="message-row-source">{sourceLabels[item.conversationType]} · {item.sourceName}</span><span className="message-row-snippet">{item.maskedSummary}</span><span className="message-row-tags"><em className={`quadrant-tag tone-${meta.tone}`}>{item.reviewQueue ? '待確認' : meta.short}</em>{item.reviewQueue && <em className="review-tag">信心 {Math.round(item.confidence * 100)}%</em>}</span></span><Icon name="arrow" className="message-arrow"/></button>;}
function MessageDetail({item,role,candidate,draft,onConfirm,onApprove,onAct}:{item?:InboxItem;role:Role;candidate?:Candidate;draft?:Draft;onConfirm:()=>void;onApprove:()=>void;onAct:(path:string,body:Record<string,unknown>,success:string)=>Promise<void>}) {if(!item)return <aside className="demo-panel detail-panel"><div className="demo-empty"><Icon name="search"/><strong>沒有可顯示的訊息</strong></div></aside>;const quadrant=item.quadrant ?? item.suggestedQuadrant ?? 'not_important_not_urgent';const meta=quadrantMeta[quadrant];return <aside className="demo-panel detail-panel" data-testid="message-detail" aria-labelledby="detail-title"><div className="detail-heading"><div><span className={`source-label source-label-${item.conversationType}`}>{sourceLabels[item.conversationType]}</span><h2 id="detail-title">{item.sender}</h2><p>{item.sourceName} · {formatDate(item.receivedAt)}</p></div><span className={`confidence-badge ${item.reviewQueue ? 'needs-review' : ''}`}>{item.reviewQueue ? '待你確認' : `信心 ${Math.round(item.confidence * 100)}%`}</span></div><div className="masked-message"><Icon name="overview"/><strong>原始訊息留在本機</strong><span>這裡只顯示遮罩摘要，第一版不跨裝置傳原文。</span></div><div className="detail-summary"><span>AI 摘要</span><p>{item.maskedSummary}</p></div>{item.reviewQueue && <div className="detail-reason"><div><span className="reason-dot"/><span>待確認理由</span></div><p>{item.reviewReason}</p><strong className={`quadrant-label tone-${meta.tone}`}>建議：{meta.label}</strong></div>}{item.attachment && <div className="detail-summary attachment-summary"><span>附件資訊</span><p>{item.attachment.name} · {item.attachment.type} · {item.attachment.available ? '可用' : '不可用'}</p></div>}{role === 'fish' && <><div className="detail-actions">{item.reviewQueue && <button className="demo-button secondary" onClick={onConfirm}>確認分類</button>}{candidate && <button className="demo-button secondary" onClick={onApprove}>核准待辦</button>}{item.conversationType === 'openchat' ? <button className="demo-button muted" disabled aria-label="OpenChat 回覆測試限制">OpenChat 回覆測試限制</button> : draft?.status === 'pending' && <button className="demo-button primary" onClick={() => void onAct(`/api/line-inbox/replies/${draft.id}/send`, {confirmed:true}, '已逐筆送出回覆草稿。')}>確認送出草稿</button>}</div>{draft && <div className="draft-preview"><div><span>回覆草稿</span><small>逐筆確認後才會送出</small></div><p>{draft.body}</p>{draft.status !== 'pending' && <small>狀態：{draft.status}</small>}</div>}</>}</aside>;}
function QuadrantBoard({items,onSelect,fullPage=false}:{items:InboxItem[];onSelect:(id:string)=>void;fullPage?:boolean}) {return <div className={`quadrant-grid ${fullPage ? 'is-full-page' : ''}`}>{quadrantKeys.map(key => {const meta=quadrantMeta[key];const list=items.filter(item => item.quadrant === key);return <section className={`quadrant-card tone-${meta.tone}`} key={key} data-quadrant={key}><div className="quadrant-card-heading"><div><span className="quadrant-dot"/><h3>{meta.label}</h3></div><strong>{list.length}</strong></div><p>{meta.description}</p><div className="quadrant-items">{list.slice(0,fullPage ? 6 : 2).map(item => <button key={item.id} onClick={() => onSelect(item.id)}><span>{item.sender}</span><small>{item.maskedSummary}</small></button>)}{!list.length && <span className="quadrant-empty">目前沒有訊息</span>}</div></section>;})}</div>;}
function TaskPreview({tasks,onToggle}:{tasks:Task[];onToggle:(task:Task)=>void}) {return <div className="task-list">{tasks.slice(0,3).map(task => <TaskRow key={task.id} task={task} onToggle={onToggle}/>)}</div>;}
function TaskView({data,role,onToggle}:{data:DashboardData;role:Role;onToggle:(task:Task)=>void}) {return <section className="task-page"><div className="page-title-block"><span className="demo-eyebrow">已核准事項</span><h1>待辦協作</h1><p>{role === 'fish' ? '先確認 AI 建議，再把真正需要完成的事交給家人協作。' : '這些是 Fish 已核准，協作成員可以一起處理的事項。'}</p></div><div className="task-page-grid"><div className="demo-panel"><div className="panel-heading"><div><span className="panel-kicker">目前清單</span><h2>已核准待辦</h2></div><span className="panel-count">{data.tasks.length} 件</span></div><div className="task-list">{data.tasks.map(task => <TaskRow key={task.id} task={task} onToggle={onToggle}/>)}</div></div><div className="task-guide"><span className="demo-label">協作邊界</span><h2>家人看到的是工作，不是對話。</h2><p>原始 LINE 訊息、回覆草稿與分類操作保留給 Fish。家人只需要處理已核准的待辦。</p><div className="guide-line"><Icon name="projects"/><span>可以完成待辦與補充備註</span></div><div className="guide-line"><Icon name="settings"/><span>每個動作都留下帳號紀錄</span></div></div></div></section>;}
function TaskRow({task,onToggle}:{task:Task;onToggle:(task:Task)=>void}) {return <div className={`task-row ${task.status === '完成' ? 'is-done' : ''}`}><button className="task-check" aria-label={`${task.status === '完成' ? '取消完成' : '標記完成'}：${task.title}`} onClick={() => onToggle(task)}>{task.status === '完成' && <Icon name="check"/>}</button><div className="task-row-copy"><strong>{task.title}</strong><span>{task.notes}</span><small>{formatDate(task.dueAt)} · {task.assignee}</small></div><span className={`task-status status-${task.status === '完成' ? 'done' : task.status === '進行中' ? 'progress' : 'todo'}`}>{task.status}</span></div>;}
function FamilyBoundaryView() {return <section className="settings-page"><div className="page-title-block"><span className="demo-eyebrow">家庭權限</span><h1>家人只處理已核准待辦</h1><p>Connector、備份、分類與回覆權限保留給 Fish；家人只看遮罩摘要、四象限與已核准待辦。</p></div></section>;}
function SettingsView({data,act,notify}:{data:DashboardData;act:(path:string,body:Record<string,unknown>,success:string)=>Promise<void>;notify:(message:string)=>void}) {const status=data.sync.state;const backupError=data.backup.state==='error';return <section className="settings-page"><div className="page-title-block"><span className="demo-eyebrow">資料邊界</span><h1>連接與備份</h1><p>所有外部能力目前都是 simulated／disabled；離線時本機 intake 仍可保存並排入備份佇列。</p></div><div className="settings-grid"><SettingCard icon="search" label="LINE Connector · simulated" title="假資料 Connector" detail={`private · group · openchat；目前狀態：${status === 'offline' ? '離線' : status === 'backfilling' ? '補同步中' : 'online'}`} action="模擬同步中斷" onClick={() => void act('/api/line-inbox/sync/control',{state:'offline'},'已模擬 Connector 離線。')} tone="neutral"/><SettingCard icon="overview" label="同步恢復 · simulated" title={status === 'backfilling' ? '補同步中' : '可恢復'} detail={`最後成功同步：${formatDate(data.sync.lastSuccessfulAt)}`} action={status === 'backfilling' ? '繼續補抓' : '恢復並繼續補抓'} onClick={() => void act(status === 'backfilling' ? '/api/line-inbox/backfill/continue' : '/api/line-inbox/sync/control',{state:'online'},status === 'backfilling' ? '已完成一批歷史補抓。' : '已恢復同步，開始補抓。')} tone="green"/><SettingCard icon="settings" label="Google Drive · simulated" title={`本機加密備份 · ${backupError ? 'error' : 'simulated'}`} detail={`${data.backup.queueCount} 筆待重試；不接真實 OAuth，備份 payload 先在本機加密。`} action={backupError || data.backup.queueCount ? '重試備份佇列' : '模擬備份故障'} onClick={() => backupError || data.backup.queueCount ? void act('/api/line-inbox/backup/retry',{},'備份佇列已重試。') : void act('/api/line-inbox/backup/control',{state:'error'},'已模擬備份故障；新的訊息仍會進本機佇列。')} tone="green"/><SettingCard icon="projects" label="家庭權限" title="Fish／家人分離" detail="家人看遮罩摘要、四象限與核准待辦；不能讀原文、分類或送回覆。" action="查看權限邊界" onClick={() => notify('權限邊界：家人只看遮罩摘要、四象限與已核准待辦。')} tone="amber"/></div><PreferencePanel preferences={data.classificationPreferences ?? []} act={act}/></section>;}
function PreferencePanel({preferences,act}:{preferences:NonNullable<DashboardData['classificationPreferences']>;act:(path:string,body:Record<string,unknown>,success:string)=>Promise<void>}) {const [pattern,setPattern]=useState<SourceType>('private');const current=preferences.find(item=>item.pattern===pattern);const [quadrant,setQuadrant]=useState<QuadrantKey>(current?.quadrant ?? 'important_not_urgent');useEffect(()=>{setQuadrant(current?.quadrant ?? 'important_not_urgent');},[current?.id,current?.quadrant]);return <article className="setting-card preference-panel"><div className="setting-icon"><Icon name="reports"/></div><span className="demo-label">AI 分類規則</span><h2>分類偏好</h2><p>只套用在 Fish 的後續訊息；家人不會看到或修改這些偏好。</p><div className="preference-controls"><label>來源<select aria-label="偏好來源" value={pattern} onChange={event=>setPattern(event.target.value as SourceType)}><option value="private">一對一</option><option value="group">一般群組</option><option value="openchat">LINE 社群</option></select></label><label>四象限<select aria-label="偏好象限" value={quadrant} onChange={event=>setQuadrant(event.target.value as QuadrantKey)}>{quadrantKeys.map(key=><option key={key} value={key}>{quadrantMeta[key].label}</option>)}</select></label></div><div className="preference-actions"><button className="demo-button primary" onClick={()=>void act('/api/line-inbox/classification-preferences',{pattern,quadrant},'分類偏好已儲存。')}>儲存分類偏好</button>{current&&<button className="demo-button secondary" onClick={()=>void act('/api/line-inbox/classification-preferences',{pattern,clear:true},'分類偏好已清除。')}>清除目前偏好</button>}</div><div className="preference-list" aria-label="已保存的分類偏好">{preferences.length?preferences.map(item=><div className="preference-row" key={item.id}><span>{sourceLabels[item.pattern]} → {quadrantMeta[item.quadrant].label}</span><small>{formatDate(item.updatedAt)}</small></div>):<span className="preference-empty">目前沒有分類偏好</span>}</div></article>;}
function SettingCard({icon,label,title,detail,action,onClick,tone}:{icon:IconName;label:string;title:string;detail:string;action:string;onClick?:()=>void;tone:'neutral'|'green'|'amber'}) {return <article className={`setting-card tone-${tone}`}><div className="setting-icon"><Icon name={icon}/></div><span className="demo-label">{label}</span><h2>{title}</h2><p>{detail}</p><button className="text-link" onClick={onClick} disabled={!onClick}>{action}<Icon name="arrow"/></button></article>;}

createRoot(document.getElementById('root')!).render(<App/>);
