import {useEffect, useMemo, useRef, useState} from 'react';
import type {RecordData, Workspace} from './api';
import {
  availablePaths,
  captureLearningCheckpoint,
  createLearningSession,
  evaluateLearning,
  prepareLearningCommand,
  type LearningPathId,
  type LearningSession,
} from './learning';
import {readActiveLearningSession, readLearningSession, rememberLearningOperation, writeLearningSession} from './learning-storage';
import {learningRecordTarget,type WorkspaceTarget} from './workbench-model';
import {learningFacts, readLearningView, writeLearningView, type LearningViewState} from './learning-view';
import './learning.css';

export interface LearningStudioProps {
  workspace: Workspace;
  busy: boolean;
  pending: boolean;
  onCommand: (action: string, payload: RecordData) => Promise<{result: string; workspace: Workspace} | null>;
  onNavigate: (nav: string,target?:WorkspaceTarget) => void;
}

const routeCopy: Record<LearningPathId, {headline: string;intro: string;outcome: string}> = {
  sales: {
    headline: '把一筆訂單，走到出貨。',
    intro: '先備好商品和測試幣，再看訂單如何保留庫存、收款與出貨。每一步都會留下可以核對的紀錄。',
    outcome: '你會看見：付款不會移動庫存，出貨才會扣除 FIFO 成本層。',
  },
  service: {
    headline: '讓交付有版本，讓驗收有依據。',
    intro: '從案件開始，把需求變成報價、服務與交付。核對最新版本後，再完成模擬驗收和付款。',
    outcome: '你會看見：交付與驗收對應同一個最新版本，測試幣付款接在驗收之後。',
  },
  manufacturing: {
    headline: '把材料，變成一件成品。',
    intro: '沿用範本中的材料與 BOM，採購這次需要的材料，再依序備料、開工與完工。看庫存數量和材料成本如何一起移動。',
    outcome: '你會看見：備料保留材料，完工才消耗材料，並把成本帶進成品。',
  },
};

const nodeNames: Record<string, string> = {
  customer: '客戶', wallet: '測試幣', inventory: '商品與材料', order: '訂單',
  bom: '物料清單', production: '製造工單', case: '客戶案件', quote: '報價版本',
  service: '服務確認', delivery: '交付與驗收',
};
const checks: Record<LearningPathId, {question: string;choices: string[];answer: number;explanation: string}> = {
  sales: {
    question: '建立訂單後，保留庫存代表什麼？',
    choices: ['已經出貨，商品離開庫存', '保留給這筆訂單，現有量還沒有減少', '買家已經付清測試幣'],
    answer: 1,
    explanation: '建立訂單會保留數量，可用庫存因此減少，現有量維持不變。全額模擬付款後才能出貨；出貨時才扣除現有量與 FIFO 成本。',
  },
  service: {
    question: '補交一個新版本後，應驗收哪個版本？',
    choices: ['第一個版本，因為最早提交', '任意一個已提交版本', '最新交付版本及其正確摘要'],
    answer: 2,
    explanation: '系統只接受最新交付與正確摘要。補交會更新最新版本；已收取測試幣的服務不能再改交付。這些確認只供模擬流程。',
  },
  manufacturing: {
    question: '工單備料後，材料什麼時候真正被消耗？',
    choices: ['備料時', '開工時', '完工入庫時'],
    answer: 2,
    explanation: '備料會保留材料，開工會更新工單狀態。完工才消耗材料的 FIFO 成本層，並把材料成本轉入成品庫存。取消未完工工單會釋放保留量。',
  },
};

function getInitial(workspace: Workspace): LearningSession | null {
  const active = readActiveLearningSession(workspace);
  if (active) return active;
  const saved = availablePaths(workspace).map(path => readLearningSession(workspace, path.id))
    .filter((session): session is LearningSession => !!session)
    .sort((a, b) => (b.checkpoints.at(-1)?.version || 0) - (a.checkpoints.at(-1)?.version || 0));
  if (saved.length) return saved[0];
  const first = availablePaths(workspace)[0];
  return first ? createLearningSession(workspace, first.id) : null;
}

function readPaused(generation: string) {
  try {return sessionStorage.getItem(`freedom-erp.learning.paused.${generation}`) === 'true';} catch {return false;}
}

export function LearningStudio({workspace, busy, pending, onCommand, onNavigate}: LearningStudioProps) {
  const paths = useMemo(() => availablePaths(workspace), [workspace]);
  const [session, setSession] = useState<LearningSession | null>(() => getInitial(workspace));
  const [viewState, setViewState] = useState<LearningViewState>(() => session ? readLearningView(workspace, session) : {selectedStep: null, choice: null, scope: 'lesson', compact: false, snapshots: {}});
  const viewRef = useRef(viewState);
  const selectedStep = viewState.selectedStep;
  const choice = viewState.choice;
  const [paused, setPaused] = useState(() => readPaused(workspace.generation_id));
  const [reducedMotion, setReducedMotion] = useState(false);
  const [notice, setNotice] = useState('');
  const [localBusy, setLocalBusy] = useState(false);
  const sceneHeading = useRef<HTMLHeadingElement>(null);
  const version = workspace.version;
  const generation = workspace.generation_id;

  function updateView(patch: Partial<LearningViewState>, updatedWorkspace = workspace, updatedSession = session) {
    if (!updatedSession) return;
    const next = {...viewRef.current, ...patch};
    viewRef.current = next;
    setViewState(next);
    writeLearningView(updatedWorkspace, updatedSession, next);
  }

  function restoreView(updatedSession: LearningSession) {
    const next = readLearningView(workspace, updatedSession);
    viewRef.current = next;
    setViewState(next);
  }

  function focusScene() {
    window.requestAnimationFrame(() => {
      sceneHeading.current?.focus({preventScroll: true});
      sceneHeading.current?.scrollIntoView({behavior: reducedMotion ? 'auto' : 'smooth', block: 'start'});
    });
  }

  useEffect(() => {
    if (!session || session.generation !== generation) return;
    writeLearningSession(session);
    restoreView(session);
  }, [session?.generation, session?.path, session?.runId]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  useEffect(() => {setPaused(readPaused(generation));}, [generation]);

  function pauseLesson(value: boolean) {
    setPaused(value);
    try {sessionStorage.setItem(`freedom-erp.learning.paused.${generation}`, String(value));} catch { /* Practice remains available in this tab. */ }
  }

  useEffect(() => {
    setSession(previous => {
      if (!previous || previous.generation !== generation || !paths.some(path => path.id === previous.path)) {
        return getInitial(workspace);
      }
      return readLearningSession(workspace, previous.path) || previous;
    });
  }, [generation, version, pending]);

  useEffect(() => {
    if(session&&!pending&&!localBusy)restoreView(session);
  }, [pending,localBusy,session?.checkpoints.length]);

  const evaluation = session ? evaluateLearning(workspace, session) : null;
  const activePath = evaluation?.path;
  const nextIndex = evaluation?.nextIndex ?? 0;
  const selectedIndex = evaluation?.steps.findIndex(item => item.step.id === selectedStep) ?? -1;
  const currentIndex = selectedIndex >= 0 ? selectedIndex : Math.min(nextIndex, (evaluation?.steps.length || 1) - 1);
  const current = evaluation?.steps[currentIndex];
  const completedCount = evaluation?.steps.filter(item => item.complete).length || 0;
  const total = evaluation?.steps.length || 0;
  const command = session && current ? prepareLearningCommand(workspace, session, current.step.id) : null;
  const canExecute = !!current && !current.complete && currentIndex === nextIndex && !paused && !busy && !localBusy && !pending && command && !('blocked' in command);
  const readingPast = !!current?.complete;
  const readingAhead = currentIndex > nextIndex;
  const pathId = activePath?.id || 'sales';
  const copy = routeCopy[pathId];
  const quiz = checks[pathId];
  const currentFacts = session ? learningFacts(workspace, session, viewState.scope) : [];
  const change = current && session?.generation === generation ? viewState.snapshots[current.step.id] : undefined;

  function selectPath(id: LearningPathId) {
    if (busy || localBusy || pending) return;
    const next = readLearningSession(workspace, id) || createLearningSession(workspace, id);
    setSession(next);
    writeLearningSession(next);
    restoreView(next);
    setNotice('已切換教學路線，尚未執行任何操作。');
  }

  function restartLesson() {
    if (!session || busy || localBusy || pending) return;
    const next = createLearningSession(workspace, session.path);
    writeLearningSession(next);
    setSession(next);
    restoreView(next);
    setNotice('已另開一輪練習。現有工作區資料保留，新的實作仍需要逐步按下執行。');
  }

  async function execute() {
    if (!session || !current || !command || 'blocked' in command || !canExecute) return;
    setLocalBusy(true);
    setNotice('正在執行這一步，等待工作區確認結果…');
    const before = learningFacts(workspace, session, 'lesson');
    rememberLearningOperation(session, current.step.id, command, workspace.version, before);
    try {
      const result = await onCommand(command.action, command.payload);
      if (!result) {
        setNotice('這一步尚未確認完成。請處理工作區提示，再核對原操作結果。');
        return;
      }
      const updated = captureLearningCheckpoint(session, current.step.id, command, result.result, result.workspace);
      writeLearningSession(updated);
      setSession(updated);
      const after = learningFacts(result.workspace, updated, 'lesson');
      const snapshot = {version: updated.checkpoints.at(-1)!.version, result: result.result, rows: after.map(row => ({label: row.label, before: before.find(previous => previous.label.split(' ·')[0] === row.label.split(' ·')[0])?.value || '—', after: row.value}))};
      updateView({selectedStep: current.step.id, snapshots: {...viewRef.current.snapshots, [current.step.id]: snapshot}}, result.workspace, updated);
      setNotice('操作已確認。下方顯示實際紀錄與前後變化，閱讀內容不會新增完成證據。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '這一步尚未完成，請核對工作區提示。');
    } finally {
      setLocalBusy(false);
    }
  }

  function selectStep(id: string) {
    if(busy||localBusy)return;
    updateView({selectedStep: id});
    setNotice('已開啟章節閱讀，工作區資料沒有改變。');
    focusScene();
  }

  function goNext() {
    if (!evaluation||busy||localBusy) return;
    const index = Math.min(evaluation.nextIndex, evaluation.steps.length - 1);
    updateView({selectedStep: evaluation.steps[index].step.id});
    focusScene();
  }

  if (!activePath || !session || !current) return (
    <section className="learning-empty" data-testid="learning-studio">
      <span className="badge">SIM 教學</span>
      <h1>先啟用一條完整工作流程</h1>
      <p>商品銷售需要 CRM、商品庫存、訂單與測試幣；服務交付需要 CRM、服務與測試幣；製造需要商品庫存、製造與測試幣。</p>
      <button onClick={() => onNavigate('settings')}>查看模組設定</button>
      <button data-testid="learning-exit" onClick={() => onNavigate('overview')}>回工作總覽</button>
    </section>
  );

  const nodes = pathId === 'sales' ? ['wallet', 'inventory', 'order', 'inventory']
    : pathId === 'service' ? ['case', 'quote', 'service', 'delivery', 'wallet']
    : ['inventory', 'bom', 'production', 'inventory'];
  const nodeFact = (node: string, index: number): string => {
    const wanted = node === 'wallet' ? (pathId === 'sales' ? '買家測試幣' : '商家測試幣')
      : node === 'inventory' ? (index === nodes.length - 1 ? pathId === 'manufacturing' ? '成品現有量' : '已出貨' : pathId === 'manufacturing' ? '材料現有量' : '商品現有量')
      : node === 'order' ? '訂單' : node === 'case' ? '案件' : node === 'quote' ? '報價'
      : node === 'service' ? '已驗收服務' : node === 'delivery' ? '交付版本' : node === 'bom' ? 'BOM 版本' : '工單';
    const fact = currentFacts.find(row => row.label.split(' ·')[0].endsWith(wanted))
      || (node === 'inventory' && viewState.scope === 'workspace' ? currentFacts.find(row => row.label.includes('庫存現有量')) : undefined);
    if (fact) return `${fact.label} ${fact.value}`;
    if (node === 'bom') return '沿用範本 BOM，版本由工單凍結';
    return '本輪尚無對應紀錄';
  };
  const nodeIsCurrent = (node: string, index: number) => current.step.node === node && (node !== 'inventory'
    || (['ship', 'complete'].includes(current.step.id) ? index === nodes.length - 1 : index === nodes.indexOf('inventory')));

  return (
    <section className={`learning-studio ${paused || reducedMotion ? 'learning-still' : ''} ${viewState.compact ? 'learning-compact' : ''}`} data-testid="learning-studio">
      <div className="learning-topline">
        <div><span className="learning-kicker">SIM 實作教學</span><span className="learning-workspace">{workspace.company_name}</span></div>
        <button className="learning-exit" data-testid="learning-exit" onClick={() => onNavigate('overview')}>回工作總覽 <span aria-hidden="true">↗</span></button>
      </div>

      <div className="learning-route-picker" aria-label="選擇教學路線">
        {paths.map(path => (
          <button key={path.id} data-testid={`learning-route-${path.id}`} aria-pressed={path.id === session.path} disabled={busy || localBusy || pending} className={path.id === session.path ? 'is-selected' : ''} onClick={() => selectPath(path.id)}>
            <span className="learning-route-icon" aria-hidden="true">{path.id === 'sales' ? '↗' : path.id === 'service' ? '✓' : '◇'}</span>
            <span><strong>{path.title}</strong><small>{path.subtitle}</small><em>{(() => {const saved = session.path === path.id ? session : readLearningSession(workspace, path.id); const count = saved ? evaluateLearning(workspace, saved).steps.filter(item => item.complete).length : 0; return `${count}／${path.steps.length} 步驟已確認`;})()}</em></span>
          </button>
        ))}
      </div>

      <div className="learning-view-tools">
        <div className="learning-scope-control" role="group" aria-label="教學資料範圍"><span>資料範圍</span><button data-testid="learning-scope-lesson" aria-pressed={viewState.scope === 'lesson'} onClick={() => updateView({scope: 'lesson'})}>本輪練習</button><button data-testid="learning-scope-workspace" aria-pressed={viewState.scope === 'workspace'} onClick={() => updateView({scope: 'workspace'})}>整個工作區</button></div>
        <button className="learning-compact-toggle" data-testid="learning-compact" aria-pressed={viewState.compact} onClick={() => updateView({compact: !viewState.compact})}>{viewState.compact ? '展開教學畫面' : '精簡教學畫面'}</button>
      </div>

      <div className="learning-theatre">
        <div className="learning-theatre-header">
          <div className="learning-opening"><span className="learning-kicker">{activePath.title} · 用你的工作區實作</span><h1>{copy.headline}</h1><p>{copy.intro}</p></div>
          <div className="learning-playback">
            <span className="learning-sim-tag">SIM</span>
            {paused ? <button data-testid="learning-resume" onClick={() => {pauseLesson(false); setNotice('已繼續教學。操作仍需要你逐步確認。');}}>繼續教學 <span aria-hidden="true">▷</span></button>
              : <button data-testid="learning-pause" onClick={() => {pauseLesson(true); setNotice('已暫停教學與示意動畫，可以繼續閱讀。');}}>暫停教學 <span aria-hidden="true">Ⅱ</span></button>}
            <small>{reducedMotion ? '減少動態已開啟，圖示保持靜止。' : '示意動畫不會自動操作資料。'}</small>
          </div>
        </div>

        <div className="learning-diagram" aria-label={`${activePath.title}流程示意`}>
          <div className="learning-flow-line" aria-hidden="true"><span/></div>
          <ol className={`learning-nodes nodes-${nodes.length}`}>
            {nodes.map((node, index) => (
              <li key={`${node}-${index}`} className={nodeIsCurrent(node, index) ? 'is-current' : ''}>
                <div className="learning-node-symbol" aria-hidden="true">{node === 'wallet' ? 'S' : node === 'inventory' ? '▤' : node === 'order' ? '≡' : node === 'bom' ? '⌘' : node === 'production' ? '◇' : node === 'quote' ? '≋' : node === 'delivery' ? '✓' : '↗'}</div>
                <strong>{node === 'inventory' && index === nodes.length - 1 ? pathId === 'manufacturing' ? '成品入庫' : '出貨與成本' : nodeNames[node]}</strong>
                <span>{nodeFact(node, index)}</span>
                {nodeIsCurrent(node, index) && <small>目前章節</small>}
              </li>
            ))}
          </ol>
        </div>

        <div className="learning-theatre-bottom"><span>{copy.outcome}</span><span className="learning-live-chip"><i aria-hidden="true"/> {viewState.scope === 'lesson' ? '本輪練習 · 共用庫存另標示' : '整個工作區'} · 版本 {workspace.version}</span></div>
      </div>

      <div className="learning-progress-row">
        <div className="learning-progress-label"><strong>{completedCount}／{total} 步驟已確認</strong><span>{evaluation.complete ? '這條流程已有完整操作證據。' : '完成以實際操作與資料狀態為準。'}</span></div>
        <div className="learning-progress-track" data-testid="learning-progress" role="progressbar" aria-label="已確認的教學步驟" aria-valuemin={0} aria-valuenow={completedCount} aria-valuemax={total}><span style={{width: `${total ? completedCount / total * 100 : 0}%`}}/></div>
        {evaluation.complete && <span className="learning-complete" data-testid="learning-complete">流程已完成 ✓</span>}
      </div>
      <div className="learning-run-controls"><span>另開一輪會建立新的教學索引，現有客戶、庫存與流水都會保留。</span><button data-testid="learning-restart" disabled={busy || localBusy || pending} onClick={restartLesson}>另開一輪練習</button></div>

      <div className="learning-chapter-layout">
        <aside className="learning-chapters">
          <div className="learning-section-label">章節 <span>可自由閱讀</span></div>
          <nav aria-label="教學章節"><ol>
            {evaluation.steps.map((item, index) => <li key={item.step.id}>
              <button data-testid={`learning-step-${item.step.id}`} disabled={busy||localBusy} aria-current={current.step.id === item.step.id ? 'step' : undefined} className={`${current.step.id === item.step.id ? 'is-current' : ''} ${item.complete ? 'is-complete' : ''}`} onClick={() => selectStep(item.step.id)}>
                <span className="learning-step-number" aria-hidden="true">{item.complete ? '✓' : String(index + 1).padStart(2, '0')}</span>
                <span><strong>{item.step.title}</strong><small>{item.complete ? '已確認操作證據' : index === nextIndex ? '下一個實作步驟' : '閱讀預覽'}</small></span>
              </button>
            </li>)}
          </ol></nav>
          <p>切換章節只供閱讀，不會寫入資料，也不會算成完成。</p>
        </aside>

        <div className="learning-scene">
          <div className="learning-scene-heading"><span className="learning-kicker">章節 {String(currentIndex + 1).padStart(2, '0')}／{total}</span><span className={`learning-scene-state ${current.complete ? 'is-complete' : ''}`}>{current.complete ? '已確認' : readingAhead ? '閱讀預覽' : paused ? '已暫停' : '準備實作'}</span></div>
          <h2 ref={sceneHeading} tabIndex={-1}>{current.step.title}</h2>
          <p className="learning-scene-body">{current.step.body}</p>

          <div className="learning-preview">
            <span className="learning-section-label">這一步會改變什麼</span>
            <p>{current.step.change}</p>
            {command && !('blocked' in command) && <div className="learning-command-preview"><span aria-hidden="true">→</span><p>{command.preview}</p></div>}
            {command && 'blocked' in command && !current.complete && !readingAhead && <p className="learning-blocked">{command.blocked}</p>}
          </div>

          <div className="learning-evidence" data-testid="learning-evidence" aria-live="polite">
            <span className="learning-section-label">實際完成證據</span>
            <p className={current.complete ? 'has-evidence' : ''}>{current.complete ? current.evidence : '尚無本次操作證據。閱讀或觀看示意動畫不會完成這一步。'}</p>
            {session.checkpoints.filter(checkpoint => checkpoint.stepId === current.step.id).map(checkpoint => <details key={`${checkpoint.stepId}-${checkpoint.version}`}>
              <summary>查看操作來源與紀錄</summary>
              <dl><dt>動作</dt><dd>{checkpoint.action}</dd><dt>工作區版本</dt><dd>{checkpoint.version}</dd><dt>結果紀錄</dt><dd><code>{checkpoint.result}</code></dd><dt>模式</dt><dd>SIM 模擬</dd></dl>
            </details>)}
          </div>

          {current.complete&&!change&&<p className="learning-snapshot-note">這一步沒有保存當時的前後讀值，可用操作紀錄核對完成結果。</p>}
          {change && <div className="learning-change-board" data-testid="learning-snapshot">
            <div className="learning-change-head"><strong>本次操作前後</strong><span>本輪練習 · 操作版本 {change.version}</span></div>
            <div className="learning-change-columns" aria-hidden="true"><span>核對項目</span><span>操作前</span><span>操作後</span></div>
            {change.rows.map(row => <div className={row.before !== row.after ? 'has-changed' : ''} key={row.label}><strong>{row.label}</strong><span aria-label={`操作前 ${row.before}`}>{row.before}</span><span aria-label={`操作後 ${row.after}`}>{row.after}</span></div>)}
            <p className="learning-snapshot-note">本分頁操作時的讀值，完成以操作收據及目前資料核對。</p>
          </div>}

          <div className="learning-scene-actions" data-testid="learning-action-dock">
            {readingPast ? <><span>這一步已有證據，回看不會重複執行。</span>{!evaluation.complete && <button className="primary" data-testid="learning-next" disabled={busy||localBusy} onClick={goNext}>前往下一個實作步驟</button>}</>
              : readingAhead ? <><span>先完成前面的實作，再回到這一步。</span><button disabled={busy||localBusy} onClick={goNext}>回到目前實作步驟</button></>
              : <><span>{paused ? '繼續教學後，就能執行這一步。' : pending ? '先確認上次操作的結果，再繼續實作。' : '按下按鈕才會執行上方預覽的模擬操作。'}</span><button className="primary" data-testid="learning-execute" disabled={!canExecute} onClick={() => void execute()}>{busy || localBusy ? '等待操作確認…' : '執行這一步'}</button></>}
            <button className="learning-inspect" onClick={() => onNavigate(current.step.nav,learningRecordTarget(workspace,session,current.step.id))}>到工作台核對 ↗</button>
          </div>
          <p className="learning-live-message" role="status" aria-live="polite">{notice}</p>
        </div>
      </div>

      <div className="learning-bottom-grid">
        <section className="learning-thinking">
          <span className="learning-kicker">先想想</span><h2>{quiz.question}</h2><fieldset><legend className="learning-sr-only">選擇你的答案</legend>
            {quiz.choices.map((text, index) => <label key={text} className={choice === index ? 'is-selected' : ''}><input type="radio" data-testid={`learning-quiz-choice-${index}`} name={`learning-quiz-${pathId}`} checked={choice === index} onChange={() => updateView({choice: index})}/><span>{text}</span></label>)}
          </fieldset>
          {choice !== null && <div className="learning-answer" role="status"><strong>{choice === quiz.answer ? '你抓到這一步的重點了。' : '再看一下資料改變的時機。'}</strong><p>{quiz.explanation}</p></div>}
          <small>答題只用來理解流程，不會阻擋實作，也不會修改工作區。</small>
        </section>

        <section className="learning-live-data" data-testid="learning-live-facts">
          <div className="learning-section-label">{viewState.scope === 'lesson' ? '本輪練習的資料' : '整個工作區的資料'} <span>目前讀值</span></div><h2>{workspace.company_name}</h2>
          <dl>{currentFacts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
          <p>{viewState.scope === 'lesson' ? '本輪紀錄以這次教學的操作來源辨認，商品庫存與商家測試幣共用並另標示。' : '數字涵蓋種子資料及其他練習。教學完成證據仍只核對本輪操作。'}</p>
        </section>
      </div>

      {evaluation.complete && <div className="learning-finish"><span aria-hidden="true">✓</span><div><h2>這次練習，已有完整紀錄。</h2><p>回到工作台查看商品、流水或交付版本；需要保留時，可以在設定中匯出 SIM JSON。</p></div><button className="primary" onClick={() => onNavigate('overview')}>回工作總覽</button></div>}
    </section>
  );
}

export default LearningStudio;
