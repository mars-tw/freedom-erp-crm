import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {Miniflare, convertV4MiniflareOptions} from 'miniflare';
import {
  applyRetention,
  createLineState,
  createSimulatedBackup,
  decryptSimulatedBackup,
  ingestLineMessage,
  maskSensitive,
  projectLineState,
} from '../src/line-inbox.js';
import {createSimulatedLineAdapters} from '../src/line-adapters.js';

const require = createRequire(import.meta.url);
const {buildSync} = require('esbuild');
const origin = 'https://line.example.test';
let runtime: Miniflare;

before(() => {
  mkdirSync('.audit-tmp/line-personal-ai-inbox', {recursive: true});
  const built = buildSync({
    entryPoints: ['src/worker.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['cloudflare:workers', 'node:*'],
  });
  runtime = new Miniflare(convertV4MiniflareOptions({
    name: 'line-personal-ai-inbox',
    modules: true,
    script: built.outputFiles[0].text,
    compatibilityDate: '2026-09-28',
    compatibilityFlags: ['nodejs_compat'],
    durableObjects: {WORKSPACES: {className: 'BusinessWorkspace', useSQLite: true}},
    bindings: {PUBLIC_DEMO: 'true'},
    resourcePersistencePath: resolve('.audit-tmp/line-personal-ai-inbox/runtime'),
  }));
});
after(async () => {
  await runtime?.dispose();
});
function headerCookie(response: Response, name: string): string {
  const value = response.headers.get('set-cookie') ?? '';
  const match = value.match(new RegExp(`${name}=([^;]+)`));
  assert.ok(match, `缺少 ${name} cookie`);
  return `${name}=${match[1]}`;
}

class LineVisitor {
  cookie = '';
  csrf = '';
  version = 0;

  async request(path: string, options: RequestInit = {}) {
    const response = await runtime.dispatchFetch(origin + path, {
      ...options,
      headers: {Cookie: this.cookie, ...Object.fromEntries(new Headers(options.headers as any).entries())} as any,
    } as any) as unknown as Response;
    const workspaceCookie = response.headers.get('set-cookie')?.match(/line_workspace=([^;]+)/)?.[1];
    const sessionCookie = response.headers.get('set-cookie')?.match(/line_session=([^;]+)/)?.[1];
    const cookies = [workspaceCookie && `line_workspace=${workspaceCookie}`, sessionCookie && `line_session=${sessionCookie}`].filter(Boolean);
    if (cookies.length) this.cookie = cookies.join('; ');
    const body: any = await response.json();
    if (body.csrf) this.csrf = body.csrf;
    if (typeof body.version === 'number') this.version = body.version;
    return {response, body};
  }

  bootstrapView() { return this.request('/api/line-auth/bootstrap'); }

  post(path: string, body: unknown, key = randomUUID(), version = this.version, extra: Record<string, string> = {}) {
    return this.request(path, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'x-csrf-token': this.csrf,
        'Idempotency-Key': key,
        'If-Match-Version': String(version),
        ...extra,
      },
      body: JSON.stringify(body),
    });
  }

  async bootstrap() {
    await this.bootstrapView();
    return this.post('/api/line-auth/bootstrap', {
      email: 'fish@example.test',
      password: 'fish-demo-password',
      display_name: 'Fish',
    });
  }

  async login(email = 'fish@example.test', password = 'fish-demo-password') {
    await this.bootstrapView();
    return this.post('/api/line-auth/login', {email, password});
  }
}

test('來源投影保留三種來源並以穩定 fingerprint 去重', () => {
  // 後端 Gherkin：保存三種對話來源並保留來源類型；沒有穩定來源訊息 id 時仍避免重複。
  const state = createLineState(1);
  const inputs = [
    {accountScope: 'fish', conversationId: 'private-1', conversationType: 'private' as const, receivedAt: 1, rawText: '電話 0912-345-678', sourceMessageId: 'p-1'},
    {accountScope: 'fish', conversationId: 'group-1', conversationType: 'group' as const, receivedAt: 2, rawText: '群組提醒', sourceMessageId: 'g-1'},
    {accountScope: 'fish', conversationId: 'openchat-1', conversationType: 'openchat' as const, receivedAt: 3, rawText: '社群貼文', sourceMessageId: 'o-1'},
    {accountScope: 'fish', conversationId: 'group-2', conversationType: 'group' as const, receivedAt: 4, rawText: '沒有穩定 id', sourceMessageId: null},
  ];
  for (const input of inputs) ingestLineMessage(state, input);
  const duplicate = ingestLineMessage(state, inputs[3]);
  assert.equal(duplicate.created, false);
  assert.equal(state.inbox.length, 4);
  assert.deepEqual(new Set(state.inbox.map(item => item.conversationType)), new Set(['private', 'group', 'openchat']));
  assert.match(state.inbox.at(-1)!.deduplicationKey, /^[a-f0-9]{64}$/);
});

test('遮罩 projection 不把電話地址帶進 AI 或家人回應', () => {
  // 後端 Gherkin：敏感資料在送外部 AI 前先遮罩；家人帳號不得讀取原始訊息。
  const raw = '請打 0912-345-678，寄到台北市信義路一段 1 號。';
  const masked = maskSensitive(raw, ['0912-345-678', '台北市信義路一段 1 號']);
  assert.equal(masked.includes('0912-345-678'), false);
  assert.equal(masked.includes('台北市信義路一段 1 號'), false);
  const state = createLineState(1);
  ingestLineMessage(state, {accountScope: 'fish', conversationId: 'p', conversationType: 'private', receivedAt: 1, rawText: raw, sourceMessageId: 'p-1'});
  const family = JSON.stringify(projectLineState(state, 'family'));
  assert.equal(family.includes('raw_text'), false);
  assert.equal(family.includes('rawText'), false);
  assert.equal(family.includes('0912-345-678'), false);
});

test('重要訊息低信心進 review queue，Fish projection 可見待辦與草稿', () => {
  const state = createLineState(1);
  const result = ingestLineMessage(state, {accountScope: 'fish', conversationId: 'p', conversationType: 'private', receivedAt: 1, rawText: '請明天前回覆', sourceMessageId: 'p-1', confidence: 0.42});
  assert.equal(result.created, true);
  assert.equal(state.inbox[0].quadrant, null);
  assert.equal(state.inbox[0].reviewQueue, true);
  assert.equal(projectLineState(state, 'fish').reviewQueue.length, 1);
});

test('保存期限清理未保留原文，但重要 hold 留在 local boundary', () => {
  const state = createLineState(1);
  ingestLineMessage(state, {accountScope: 'fish', conversationId: 'remove', conversationType: 'private', receivedAt: 1, rawText: 'old remove', sourceMessageId: 'old-1'});
  ingestLineMessage(state, {accountScope: 'fish', conversationId: 'hold', conversationType: 'private', receivedAt: 1, rawText: 'old hold', sourceMessageId: 'old-2', importantHold: true});
  const result = applyRetention(state, 91 * 24 * 60 * 60 * 1000);
  assert.equal(result.removed, 1);
  assert.equal(state.rawMessages['old-1'], undefined);
  assert.equal(state.rawMessages['old-2']?.rawText, 'old hold');
  assert.equal(state.inbox.length, 2);
});

test('模擬備份先加密，錯誤復原金鑰 fail closed', async () => {
  const state = createLineState(1);
  ingestLineMessage(state, {accountScope: 'fish', conversationId: 'p', conversationType: 'private', receivedAt: 1, rawText: 'private raw', sourceMessageId: 'p-1'});
  const backup = await createSimulatedBackup(state, 'test-recovery-key', 2);
  assert.equal(backup.scope, 'dedicated-line-backup');
  assert.equal(JSON.stringify(backup).includes('private raw'), false);
  await assert.rejects(() => decryptSimulatedBackup(backup, 'wrong-key'));
  const restored = await decryptSimulatedBackup(backup, 'test-recovery-key');
  assert.equal(restored.inbox.length, 1);
});

test('simulated adapters 具備 connector、AI、通知、Email 與備份的可替換契約', async () => {
  const adapters = createSimulatedLineAdapters();
  const state = createLineState(1);
  const input = {accountScope: 'fish', conversationId: 'adapter-private', conversationType: 'private' as const, receivedAt: 2, rawText: '明天前請回覆', sourceMessageId: 'adapter-1'};
  const analyzed = adapters.ai.analyze(state, input);
  assert.equal(typeof analyzed.confidence, 'number');
  const result = adapters.connector.ingest(state, {...input, ...analyzed});
  assert.equal(result.created, true);
  adapters.notifications.publish(state, result.item, 3);
  assert.equal(state.notifications.length, 1);
  const reset = adapters.email.enqueueReset(state, 'family-1', 4);
  assert.equal(reset.expiresAt > 4, true);
  const backup = await adapters.backup.create(state, 'adapter-key', 5);
  assert.equal(backup.scope, 'dedicated-line-backup');
});

test('LINE API bootstrap、Fish dashboard 與 family RBAC 不洩漏原文', async () => {
  // 前端 Gherkin：首頁同時顯示待處理收件匣與四象限摘要；家人只能看到摘要與已核准待辦。
  const fish = new LineVisitor();
  const boot = await fish.bootstrap();
  assert.equal(boot.response.status, 200, JSON.stringify(boot.body));
  const login = await fish.login();
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  const inbox = await fish.request('/api/line-inbox');
  assert.equal(inbox.response.status, 200, JSON.stringify(inbox.body));
  assert.equal(new Set(inbox.body.items.map((item: any) => item.conversationType)).size, 3);
  assert.equal(JSON.stringify(inbox.body).includes('raw_text'), false);
  assert.equal(JSON.stringify(inbox.body).includes('rawText'), false);
  assert.equal(inbox.body.summary.important_urgent >= 1, true);
  const family = new LineVisitor();
  family.cookie = headerCookie(boot.response, 'line_workspace');
  const familyLogin = await family.login('family@example.test', 'family-demo-password');
  assert.equal(familyLogin.response.status, 200, JSON.stringify(familyLogin.body));
  const familyInbox = await family.request('/api/line-inbox');
  assert.equal(familyInbox.response.status, 200, JSON.stringify(familyInbox.body));
  assert.equal(familyInbox.body.role, 'family');
  assert.equal(familyInbox.body.drafts, undefined);
  const denied = await family.post('/api/line-inbox/task-candidates/candidate-urgent/approve', {});
  assert.equal(denied.response.status, 403);
  assert.equal(denied.body.error.code, 'forbidden');
});

test('LINE API CSRF、冪等、離線送出閘門與 OpenChat capability gate', async () => {
  // 後端 Gherkin：同步中斷時保留狀態並在恢復後補同步；OpenChat 草稿在驗證前不得送出。
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();
  const csrfFailure = await fish.post('/api/line-inbox/sync/control', {state: 'offline'}, randomUUID(), fish.version, {'x-csrf-token': 'bad'});
  assert.equal(csrfFailure.response.status, 403);
  assert.equal(csrfFailure.body.error.code, 'csrf_failed');
  const offline = await fish.post('/api/line-inbox/sync/control', {state: 'offline'});
  assert.equal(offline.response.status, 200, JSON.stringify(offline.body));
  const send = await fish.post('/api/line-inbox/replies/draft-private/send', {confirmed: true});
  assert.equal(send.response.status, 409);
  assert.equal(send.body.error.code, 'sync_offline');
  const online = await fish.post('/api/line-inbox/sync/control', {state: 'online'});
  assert.equal(online.response.status, 200, JSON.stringify(online.body));
  const openchat = await fish.post('/api/line-inbox/replies/draft-openchat/send', {confirmed: true});
  assert.equal(openchat.response.status, 409);
  assert.equal(openchat.body.error.code, 'capability_disabled');
  const key = randomUUID();
  const first = await fish.post('/api/line-inbox/task-candidates/candidate-urgent/approve', {}, key, fish.version);
  assert.equal(first.response.status, 200, JSON.stringify(first.body));
  const replay = await fish.post('/api/line-inbox/task-candidates/candidate-urgent/approve', {}, key, fish.version);
  assert.equal(replay.response.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
});

test('Fish 分類偏好可管理，且後續同來源訊息會參考偏好', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();

  const initial = await fish.request('/api/line-inbox/classification-preferences');
  assert.equal(initial.response.status, 200, JSON.stringify(initial.body));
  assert.deepEqual(initial.body.items, []);

  const saved = await fish.post('/api/line-inbox/classification-preferences', {
    pattern: 'private',
    quadrant: 'urgent_not_important',
  });
  assert.equal(saved.response.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.preference.quadrant, 'urgent_not_important');

  const ingested = await fish.post('/api/line-inbox/connector/ingest', {
    conversationId: 'preference-private',
    conversationType: 'private',
    receivedAt: Date.now(),
    rawText: '沒有期限的後續訊息',
    sourceMessageId: 'preference-private-1',
    confidence: 0.91,
  });
  assert.equal(ingested.response.status, 200, JSON.stringify(ingested.body));
  assert.equal(ingested.body.item.quadrant, 'urgent_not_important');

  const cleared = await fish.post('/api/line-inbox/classification-preferences', {
    pattern: 'private',
    clear: true,
  });
  assert.equal(cleared.response.status, 200, JSON.stringify(cleared.body));
  assert.deepEqual(cleared.body.items, []);
});

test('歷史補抓失敗不清除已完成批次，恢復後可繼續', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();
  const before = await fish.request('/api/line-inbox/sync-status');
  const beforeCompleted = before.body.sync.backfillCompleted;
  const beforeItems = (await fish.request('/api/line-inbox')).body.items.length;

  const failed = await fish.post('/api/line-inbox/backfill/continue', {simulate_failure: true});
  assert.equal(failed.response.status, 200, JSON.stringify(failed.body));
  assert.equal(failed.body.sync.state, 'error');
  assert.equal(failed.body.sync.backfillCompleted, beforeCompleted);
  assert.equal((await fish.request('/api/line-inbox')).body.items.length, beforeItems);

  const resumed = await fish.post('/api/line-inbox/backfill/continue', {});
  assert.equal(resumed.response.status, 200, JSON.stringify(resumed.body));
  assert.equal(resumed.body.sync.backfillCompleted > beforeCompleted, true);
});

test('附件 projection 只保留名稱、類型、可用狀態與連結', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();
  const response = await fish.post('/api/line-inbox/connector/ingest', {
    conversationId: 'attachment-private',
    conversationType: 'private',
    receivedAt: Date.now(),
    rawText: '附件請查收',
    sourceMessageId: 'attachment-1',
    attachment: {
      name: '報價.pdf',
      type: 'application/pdf',
      available: true,
      link: '/local/attachment-1',
      rawText: '不應出現在 projection',
      ocrText: '不應出現在 projection',
    },
  });
  assert.equal(response.response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.item.attachment, {
    name: '報價.pdf',
    type: 'application/pdf',
    available: true,
    link: '/local/attachment-1',
  });
  assert.equal(JSON.stringify(response.body).includes('ocrText'), false);
  assert.equal(JSON.stringify(response.body).includes('rawText'), false);
});

test('Fish 可以撤銷其他裝置工作階段，撤銷後不能再讀取中台', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();
  const other = new LineVisitor();
  other.cookie = fish.cookie.split('; ').find(value => value.startsWith('line_workspace=')) ?? '';
  await other.bootstrapView();
  await other.post('/api/line-auth/login', {email: 'fish@example.test', password: 'fish-demo-password', device_name: 'other-device'});
  const sessions = await fish.request('/api/line-auth/sessions');
  assert.equal(sessions.response.status, 200, JSON.stringify(sessions.body));
  const otherSession = sessions.body.items.find((item: any) => item.device_name === 'other-device');
  assert.ok(otherSession, JSON.stringify(sessions.body));
  const revoked = await fish.post(`/api/line-auth/sessions/${otherSession.id}/revoke`, {});
  assert.equal(revoked.response.status, 200, JSON.stringify(revoked.body));
  const denied = await other.request('/api/line-inbox');
  assert.equal(denied.response.status, 401, JSON.stringify(denied.body));
});

test('正式待辦保留協作欄位，家人只能改狀態與備註', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();
  const candidate = await fish.post('/api/line-inbox/task-candidates/candidate-urgent/approve', {});
  assert.equal(candidate.response.status, 200, JSON.stringify(candidate.body));
  assert.equal(typeof candidate.body.task.assignee, 'string');
  assert.equal(typeof candidate.body.task.dueAt, 'string');
  assert.equal(typeof candidate.body.task.sourceSummary, 'string');

  const family = new LineVisitor();
  family.cookie = fish.cookie.split('; ').find(value => value.startsWith('line_workspace=')) ?? '';
  await family.login('family@example.test', 'family-demo-password');
  const allowed = await family.post(`/api/line-inbox/tasks/${candidate.body.task.id}`, {status: '完成', notes: '家人已處理'});
  assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
  const denied = await family.post(`/api/line-inbox/tasks/${candidate.body.task.id}`, {title: '不應修改'});
  assert.equal(denied.response.status, 403, JSON.stringify(denied.body));
});

test('家庭密碼重設連結只能使用一次，且完成後撤銷家人工作階段', async () => {
  const fish = new LineVisitor();
  const boot = await fish.bootstrap();
  await fish.login();
  const family = new LineVisitor();
  family.cookie = headerCookie(boot.response, 'line_workspace');
  await family.login('family@example.test', 'family-demo-password');
  const request = await family.post('/api/line-auth/password-reset/request', {email: 'family@example.test'});
  assert.equal(request.response.status, 200, JSON.stringify(request.body));
  const outbox = await fish.request('/api/line-auth/password-reset/outbox');
  assert.equal(outbox.response.status, 200, JSON.stringify(outbox.body));
  const storedToken = outbox.body.items.find((item: any) => item.used === false);
  assert.ok(storedToken?.simulated_token);
  const completed = await fish.post('/api/line-auth/password-reset/complete', {token: storedToken.simulated_token, password: 'new-family-password'});
  assert.equal(completed.response.status, 200, JSON.stringify(completed.body));
  const reused = await fish.post('/api/line-auth/password-reset/complete', {token: storedToken.simulated_token, password: 'another-password'});
  assert.equal(reused.response.status, 422);
  const oldSession = await family.request('/api/line-inbox');
  assert.equal(oldSession.response.status, 401);
  const relogin = await family.login('family@example.test', 'new-family-password');
  assert.equal(relogin.response.status, 200, JSON.stringify(relogin.body));
});

test('備份故障不阻斷本機 intake，訊息進入可重試佇列', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();

  const paused = await fish.post('/api/line-inbox/backup/control', {state: 'error'});
  assert.equal(paused.response.status, 200, JSON.stringify(paused.body));
  assert.equal(paused.body.backup.state, 'error');

  const ingested = await fish.post('/api/line-inbox/connector/ingest', {
    conversationId: 'backup-outage-private',
    conversationType: 'private',
    receivedAt: Date.now(),
    rawText: '備份故障時仍要保存的訊息',
    sourceMessageId: 'backup-outage-1',
  });
  assert.equal(ingested.response.status, 200, JSON.stringify(ingested.body));
  assert.equal(ingested.body.created, true);

  const queued = await fish.request('/api/line-inbox/backup');
  assert.equal(queued.body.backup.queue_count, 2);
  const retried = await fish.post('/api/line-inbox/backup/retry', {});
  assert.equal(retried.response.status, 200, JSON.stringify(retried.body));
  assert.equal(retried.body.backup.state, 'simulated');
  assert.equal(retried.body.backup.queue_count, 0);
});

test('重要且緊急通知只給 Fish，且只含遮罩摘要', async () => {
  const fish = new LineVisitor();
  const boot = await fish.bootstrap();
  await fish.login();
  const inbox = await fish.request('/api/line-inbox');
  const review = inbox.body.reviewQueue[0];
  const confirmed = await fish.post(`/api/line-inbox/${review.id}/classification`, {quadrant: 'important_urgent'});
  assert.equal(confirmed.response.status, 200, JSON.stringify(confirmed.body));

  const notifications = await fish.request('/api/line-inbox/notifications');
  assert.equal(notifications.response.status, 200, JSON.stringify(notifications.body));
  assert.equal(notifications.body.items.length, 1);
  assert.equal(JSON.stringify(notifications.body).includes('0912-345-678'), false);
  assert.equal(notifications.body.items[0].href.includes(review.id), true);

  const family = new LineVisitor();
  family.cookie = headerCookie(boot.response, 'line_workspace');
  await family.login('family@example.test', 'family-demo-password');
  const familyNotifications = await family.request('/api/line-inbox/notifications');
  assert.deepEqual(familyNotifications.body.items, []);
});

test('備份還原先驗證再寫入隔離目標，錯誤金鑰不回傳明文', async () => {
  const fish = new LineVisitor();
  await fish.bootstrap();
  await fish.login();
  const created = await fish.post('/api/line-inbox/backup/create', {recovery_key: 'restore-test-key'});
  assert.equal(created.response.status, 200, JSON.stringify(created.body));
  const backupId = created.body.backup.id;

  const preview = await fish.post('/api/line-inbox/backup/restore-preview', {backup_id: backupId, recovery_key: 'restore-test-key'});
  assert.equal(preview.response.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.preview.target, 'isolated-line-restore-preview');
  assert.equal(preview.body.preview.would_overwrite, false);

  const restored = await fish.post('/api/line-inbox/backup/restore', {backup_id: backupId, recovery_key: 'restore-test-key'});
  assert.equal(restored.response.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.restore.target, 'isolated-line-restore');
  assert.equal(restored.body.restore.integrity_verified, true);

  const invalid = await fish.post('/api/line-inbox/backup/restore-preview', {backup_id: backupId, recovery_key: 'wrong-key'});
  assert.equal(invalid.response.status, 422);
  assert.doesNotMatch(JSON.stringify(invalid.body), /明文|private raw|rawText/);
});

test('分會管理員測試帳號沿用家人協作邊界且不能進入 Fish 操作', async () => {
  const fish = new LineVisitor();
  const boot = await fish.bootstrap();
  await fish.login();
  const branch = new LineVisitor();
  branch.cookie = headerCookie(boot.response, 'line_workspace');
  const login = await branch.login('branch-admin@example.test', 'branch-admin-demo-password');
  assert.equal(login.response.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.account.role, 'branch_admin');
  const dashboard = await branch.request('/api/line-inbox');
  assert.equal(dashboard.body.role, 'branch_admin');
  assert.equal(dashboard.body.drafts, undefined);
  const allowed = await branch.post(`/api/line-inbox/tasks/${dashboard.body.tasks[0].id}`, {status: '完成', notes: '分會已處理'});
  assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
  const taskDenied = await branch.post(`/api/line-inbox/tasks/${dashboard.body.tasks[0].id}`, {title: '不應修改'});
  assert.equal(taskDenied.response.status, 403, JSON.stringify(taskDenied.body));
  const denied = await branch.post('/api/line-inbox/sync/control', {state: 'offline'});
  assert.equal(denied.response.status, 403, JSON.stringify(denied.body));
  assert.equal(denied.body.error.code, 'forbidden');
});
