import {Problem, ok} from './problem.js';

export type LineRole = 'fish' | 'family' | 'branch_admin';
export type ConversationType = 'private' | 'group' | 'openchat';
export type Quadrant = 'important_urgent' | 'urgent_not_important' | 'not_important_not_urgent' | 'important_not_urgent';
export type SyncState = 'online' | 'offline' | 'backfilling' | 'paused' | 'error';

export interface LineMessageInput {
  accountScope: string;
  conversationId: string;
  conversationType: ConversationType;
  receivedAt: number;
  rawText: string;
  sourceMessageId: string | null;
  sender?: string;
  sourceName?: string;
  confidence?: number;
  suggestedQuadrant?: Quadrant;
  reviewReason?: string;
  attachment?: {name: string; type: string; available: boolean; link?: string};
  importantHold?: boolean;
  taskCandidate?: {title: string; assignee?: string; dueAt?: string};
  draft?: {recipient: string; channel: string; body: string};
}

export interface InboxItem {
  id: string;
  accountScope: string;
  conversationId: string;
  conversationType: ConversationType;
  sourceMessageId: string;
  deduplicationKey: string;
  sender: string;
  sourceName: string;
  maskedSummary: string;
  receivedAt: number;
  quadrant: Quadrant | null;
  suggestedQuadrant: Quadrant | null;
  confidence: number;
  reviewReason: string | null;
  reviewQueue: boolean;
  attachment?: {name: string; type: string; available: boolean; link?: string};
  syncState: SyncState;
  importantHold: boolean;
  version: number;
}

export interface RawMessage {
  sourceMessageId: string;
  rawText: string;
  receivedAt: number;
  importantHold: boolean;
  attachmentIndexes: string[];
}

export interface TaskCandidate {
  id: string;
  messageId: string;
  title: string;
  assignee: string;
  dueAt: string | null;
  sourceSummary: string;
  status: 'pending' | 'approved';
  version: number;
}

export interface LineTask {
  id: string;
  candidateId: string;
  title: string;
  assignee: string;
  dueAt: string | null;
  status: '待處理' | '進行中' | '完成';
  notes: string;
  sourceSummary: string;
  createdAt: string;
  completedAt: string | null;
  version: number;
}

export interface LineDraft {
  id: string;
  messageId: string;
  conversationType: ConversationType;
  recipient: string;
  channel: string;
  body: string;
  attachment?: {name: string; type: string; available: boolean; link?: string};
  status: 'pending' | 'sent' | 'cancelled';
  version: number;
}

export interface LineAccount {
  id: string;
  email: string;
  displayName: string;
  role: LineRole;
  passwordSalt: string;
  passwordHash: string;
  verifiedEmail: boolean;
  active: boolean;
}

export interface LineSession {
  id: string;
  accountId: string;
  role: LineRole;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  revokedAt: number | null;
  deviceName: string;
}

export interface LineAudit {
  id: string;
  actorId: string | null;
  actorRole: LineRole | 'anonymous';
  action: string;
  target: string;
  result: 'allowed' | 'denied' | 'failed';
  createdAt: string;
  requestId: string;
  errorCode: string | null;
}

export interface LineState {
  schemaVersion: 1;
  initialized: boolean;
  csrf: string;
  version: number;
  accounts: LineAccount[];
  sessions: Record<string, LineSession>;
  rawMessages: Record<string, RawMessage>;
  inbox: InboxItem[];
  taskCandidates: TaskCandidate[];
  tasks: LineTask[];
  drafts: LineDraft[];
  classificationPreferences: ClassificationPreference[];
  audits: LineAudit[];
  operations: Record<string, {hash: string; response: unknown; createdAt: string}>;
  sync: {state: SyncState; lastSuccessfulAt: string | null; lastError: string | null; backfillCompleted: number; backfillRemaining: number; backfillBatchSize: number};
  backup: {adapter: 'simulated'; state: 'simulated' | 'disabled' | 'error'; queue: Array<{id: string; createdAt: string; attempts: number}>; versions: Array<{id: string; createdAt: string; bytes: number; scope: string}>; lastSuccessfulAt: string | null};
  backupBlobs: Record<string, SimulatedBackup>;
  restoreRecords: LineRestoreRecord[];
  notifications: Array<{id: string; recipientRole: 'fish'; summary: string; href: string; createdAt: string}>;
  emailOutbox: Array<{id: string; accountId: string; token: string; createdAt: number; expiresAt: number; usedAt: number | null}>;
  rateLimits: Record<string, {windowStart: number; count: number}>;
  seeded: boolean;
}

export interface ClassificationPreference {
  id: string;
  scope: 'fish';
  pattern: ConversationType;
  quadrant: Quadrant;
  updatedAt: string;
}

export interface LineRestoreRecord {
  id: string;
  backupId: string;
  version: number;
  target: 'isolated-line-restore';
  integrityVerified: boolean;
  permissionVersion: number;
  auditCount: number;
  createdAt: string;
}

export interface ProjectedLineState {
  role: LineRole;
  version: number;
  items: Array<Omit<InboxItem, 'accountScope' | 'deduplicationKey' | 'importantHold' | 'version'>>;
  summary: Record<Quadrant | 'review', number> & {important_urgent: number};
  reviewQueue: InboxItem[];
  taskCandidates?: TaskCandidate[];
  tasks: LineTask[];
  drafts?: LineDraft[];
  classificationPreferences?: LineState['classificationPreferences'];
  sync: LineState['sync'];
  backup: Omit<LineState['backup'], 'queue'> & {queueCount: number};
  notifications?: LineState['notifications'];
}

const DAY = 24 * 60 * 60 * 1000;
const SESSION_IDLE = 30 * 60 * 1000;
const RESET_TTL = 15 * 60 * 1000;
const REVIEW_THRESHOLD = 0.75;

function randomHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, item => item.toString(16).padStart(2, '0')).join('');
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes instanceof ArrayBuffer ? bytes : bytes.buffer), item => item.toString(16).padStart(2, '0')).join('');
}

function unhex(value: string): ArrayBuffer {
  ok(/^[a-f0-9]+$/i.test(value) && value.length % 2 === 0, 422, 'backup_invalid', '備份資料格式不符');
  const output = new Uint8Array(value.match(/.{2}/g)!.map(item => Number.parseInt(item, 16)));
  return output.buffer;
}

function fingerprint(value: string): string {
  const lanes = [2166136261, 2654435761, 2246822519, 3266489917];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    for (let lane = 0; lane < lanes.length; lane += 1) {
      lanes[lane] ^= (code + lane * 17) & 0xff;
      lanes[lane] = Math.imul(lanes[lane], 16777619 + lane * 13) >>> 0;
      lanes[lane] ^= lanes[(lane + 1) % lanes.length] >>> 7;
    }
  }
  return lanes.map(lane => lane.toString(16).padStart(8, '0')).join('').repeat(2);
}

function iso(now: number): string { return new Date(now).toISOString(); }

export function maskSensitive(text: string, configuredValues: string[] = []): string {
  let masked = text;
  for (const value of [...configuredValues].filter(Boolean).sort((a, b) => b.length - a.length)) masked = masked.split(value).join('[敏感資料]');
  masked = masked.replace(/(?<!\d)(?:\+?886[-\s]?)?09\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g, '[電話]');
  masked = masked.replace(/(?:台灣)?[\p{Script=Han}]{1,5}[縣市][^，。\n]{0,30}?(?:路|街|巷|弄|號)\d*[號巷弄]?/gu, '[地址]');
  return masked;
}

export function createLineState(now = Date.now()): LineState {
  return {
    schemaVersion: 1,
    initialized: false,
    csrf: randomHex(32),
    version: 0,
    accounts: [],
    sessions: {},
    rawMessages: {},
    inbox: [],
    taskCandidates: [],
    tasks: [],
    drafts: [],
    classificationPreferences: [],
    audits: [],
    operations: {},
    sync: {state: 'online', lastSuccessfulAt: iso(now), lastError: null, backfillCompleted: 0, backfillRemaining: 0, backfillBatchSize: 2},
    backup: {adapter: 'simulated', state: 'simulated', queue: [], versions: [], lastSuccessfulAt: null},
    backupBlobs: {},
    restoreRecords: [],
    notifications: [],
    emailOutbox: [],
    rateLimits: {},
    seeded: false,
  };
}

function quadrantFor(input: LineMessageInput): Quadrant {
  if (input.suggestedQuadrant) return input.suggestedQuadrant;
  if (input.conversationType === 'openchat') return 'not_important_not_urgent';
  if (/明天|今天|期限|截止|立刻|現在/.test(input.rawText)) return 'important_urgent';
  if (input.conversationType === 'group') return 'urgent_not_important';
  return 'important_not_urgent';
}

function safeText(value: string | undefined, fallback: string, max = 240): string {
  return (typeof value === 'string' && value.trim() ? value.trim() : fallback).slice(0, max);
}

function safeAttachment(value: LineMessageInput['attachment']): InboxItem['attachment'] {
  if (!value) return undefined;
  const attachment: NonNullable<InboxItem['attachment']> = {
    name: safeText(value.name, '未命名附件', 120),
    type: safeText(value.type, 'application/octet-stream', 80),
    available: value.available === true,
  };
  if (typeof value.link === 'string' && value.link.trim()) attachment.link = value.link.trim().slice(0, 500);
  return attachment;
}

export function ingestLineMessage(state: LineState, input: LineMessageInput): {created: boolean; item: InboxItem} {
  ok(['private', 'group', 'openchat'].includes(input.conversationType), 422, 'source_invalid', '來源類型不符');
  ok(input.accountScope.length > 0 && input.conversationId.length > 0, 422, 'source_invalid', '來源範圍不符');
  ok(Number.isFinite(input.receivedAt) && input.receivedAt > 0, 422, 'source_invalid', '訊息時間不符');
  ok(typeof input.rawText === 'string' && input.rawText.length <= 4000, 422, 'source_invalid', '原始訊息長度不符');
  const base = `${input.accountScope}|${input.conversationType}|${input.conversationId}|${input.receivedAt}|${input.rawText}`;
  const deduplicationKey = input.sourceMessageId ? fingerprint(`${input.accountScope}|${input.sourceMessageId}`) : fingerprint(base);
  const existing = state.inbox.find(item => item.deduplicationKey === deduplicationKey);
  if (existing) return {created: false, item: existing};
  const sourceMessageId = input.sourceMessageId || `fingerprint-${deduplicationKey}`;
  const confidence = Math.min(1, Math.max(0, input.confidence ?? (input.conversationType === 'openchat' ? 0.95 : 0.88)));
  const preference = state.classificationPreferences.find(value => value.scope === 'fish' && value.pattern === input.conversationType);
  const suggestedQuadrant = input.suggestedQuadrant ?? preference?.quadrant ?? quadrantFor(input);
  const reviewQueue = confidence < REVIEW_THRESHOLD;
  const id = `msg-${state.inbox.length + 1}-${deduplicationKey.slice(0, 8)}`;
  const item: InboxItem = {
    id,
    accountScope: input.accountScope,
    conversationId: input.conversationId,
    conversationType: input.conversationType,
    sourceMessageId,
    deduplicationKey,
    sender: safeText(input.sender, input.conversationType === 'private' ? '一對一聯絡人' : input.conversationType === 'group' ? '一般群組' : 'LINE 社群'),
    sourceName: safeText(input.sourceName, input.conversationType === 'private' ? '一對一' : input.conversationType === 'group' ? '一般群組' : 'LINE 社群', 100),
    maskedSummary: maskSensitive(input.rawText),
    receivedAt: input.receivedAt,
    quadrant: reviewQueue ? null : suggestedQuadrant,
    suggestedQuadrant: reviewQueue ? suggestedQuadrant : null,
    confidence,
    reviewReason: reviewQueue ? safeText(input.reviewReason, 'AI 信心低於確認門檻。', 200) : null,
    reviewQueue,
    attachment: safeAttachment(input.attachment),
    syncState: state.sync.state,
    importantHold: input.importantHold === true,
    version: 1,
  };
  state.inbox.push(item);
  state.rawMessages[sourceMessageId] = {sourceMessageId, rawText: input.rawText, receivedAt: input.receivedAt, importantHold: item.importantHold, attachmentIndexes: item.attachment ? [item.attachment.name] : []};
  if (input.taskCandidate) state.taskCandidates.push({id: `candidate-${state.taskCandidates.length + 1}`, messageId: id, title: safeText(input.taskCandidate.title, '待確認事項'), assignee: safeText(input.taskCandidate.assignee, 'Fish', 80), dueAt: input.taskCandidate.dueAt ?? null, sourceSummary: item.maskedSummary, status: 'pending', version: 1});
  if (input.draft) state.drafts.push({id: `draft-${state.drafts.length + 1}`, messageId: id, conversationType: input.conversationType, recipient: safeText(input.draft.recipient, item.sender, 100), channel: safeText(input.draft.channel, 'LINE', 80), body: safeText(input.draft.body, '待 Fish 確認的回覆草稿。', 2000), attachment: item.attachment, status: 'pending', version: 1});
  return {created: true, item};
}

export function seedLineFixtures(state: LineState, now = Date.now()): void {
  if (state.seeded) return;
  const fixtures: LineMessageInput[] = [
    {accountScope: 'fish', conversationId: 'private-client-a', conversationType: 'private', receivedAt: now - 10 * 60 * 1000, rawText: '明天中午前可以先給我新版報價嗎？電話 0912-345-678', sourceMessageId: 'private-001', sender: '客戶 A', sourceName: '一對一', confidence: 0.62, reviewReason: '包含明確期限，但仍需 Fish 確認重要性。', taskCandidate: {title: '整理新版報價並回覆客戶 A', assignee: 'Fish', dueAt: iso(now + DAY)}, draft: {recipient: '客戶 A', channel: 'LINE 一對一', body: '可以，我今天會先整理新版報價，明天中午前提供給你。'}},
    {accountScope: 'fish', conversationId: 'private-partner-b', conversationType: 'private', receivedAt: now - 60 * 60 * 1000, rawText: '合約我看過了，有兩個地方想和你討論。', sourceMessageId: 'private-002', sender: '合作夥伴 B', sourceName: '一對一', confidence: 0.94, suggestedQuadrant: 'important_urgent', taskCandidate: {title: '確認合約兩個修改點', assignee: 'Fish', dueAt: iso(now + 3 * DAY)}, draft: {recipient: '合作夥伴 B', channel: 'LINE 一對一', body: '收到，我先整理兩個修改點，明天找時間和你一起確認。'}},
    {accountScope: 'fish', conversationId: 'family-group', conversationType: 'group', receivedAt: now - 2 * 60 * 60 * 1000, rawText: '週六晚餐改成 18:30，可以嗎？', sourceMessageId: 'group-001', sender: '家人群組', sourceName: '一般群組', confidence: 0.88, suggestedQuadrant: 'important_not_urgent', draft: {recipient: '家人群組', channel: 'LINE 一般群組', body: '可以，週六 18:30 見。'}},
    {accountScope: 'fish', conversationId: 'work-group', conversationType: 'group', receivedAt: now - 3 * 60 * 60 * 1000, rawText: '請大家在今天 17:00 前填完表單。', sourceMessageId: 'group-002', sender: '工作通知群', sourceName: '一般群組', confidence: 0.91, suggestedQuadrant: 'urgent_not_important'},
    {accountScope: 'fish', conversationId: 'openchat-furniture', conversationType: 'openchat', receivedAt: now - 4 * 60 * 60 * 1000, rawText: '本週末有一批書桌出清，歡迎看看。', sourceMessageId: 'openchat-001', sender: '台南二手家具交流', sourceName: 'LINE 社群', confidence: 0.97},
    {accountScope: 'fish', conversationId: 'openchat-cafe', conversationType: 'openchat', receivedAt: now - DAY, rawText: '有人知道東區哪裡可以帶筆電工作嗎？', sourceMessageId: 'openchat-002', sender: '台南咖啡同好', sourceName: 'LINE 社群', confidence: 0.95},
  ];
  for (const fixture of fixtures) ingestLineMessage(state, fixture);
  const urgent = state.taskCandidates.find(item => item.title.startsWith('整理新版報價'));
  if (urgent) urgent.id = 'candidate-urgent';
  const draftPrivate = state.drafts.find(item => item.conversationType === 'private');
  if (draftPrivate) draftPrivate.id = 'draft-private';
  const openchatMessage = state.inbox.find(item => item.conversationType === 'openchat');
  state.drafts.push({id: 'draft-openchat', messageId: openchatMessage?.id ?? 'openchat-1', conversationType: 'openchat', recipient: 'LINE 社群', channel: 'LINE OpenChat', body: '待測試的社群回覆草稿。', status: 'pending', version: 1});
  const approved = state.taskCandidates.find(item => item.title.startsWith('確認合約'));
  if (approved) {
    approved.status = 'approved';
    state.tasks.push({id: 'task-approved', candidateId: approved.id, title: approved.title, assignee: approved.assignee, dueAt: approved.dueAt, status: '進行中', notes: '由 Fish 核准，家人可以協作。', sourceSummary: approved.sourceSummary, createdAt: iso(now - 30 * 60 * 1000), completedAt: null, version: 1});
  }
  state.sync.backfillCompleted = 1;
  state.sync.backfillRemaining = 2;
  state.backup.queue.push({id: 'backup-seed', createdAt: iso(now), attempts: 0});
  state.seeded = true;
}

function publicInbox(item: InboxItem): ProjectedLineState['items'][number] {
  const {accountScope: _accountScope, deduplicationKey: _deduplicationKey, importantHold: _importantHold, version: _version, ...safe} = item;
  return safe;
}

export function projectLineState(state: LineState, role: LineRole): ProjectedLineState {
  const summary = {important_urgent: 0, urgent_not_important: 0, not_important_not_urgent: 0, important_not_urgent: 0, review: 0} as ProjectedLineState['summary'];
  for (const item of state.inbox) {
    if (item.reviewQueue) summary.review += 1;
    if (item.quadrant) summary[item.quadrant] += 1;
  }
  const result: ProjectedLineState = {
    role,
    version: state.version,
    items: state.inbox.map(publicInbox),
    summary,
    reviewQueue: role === 'fish' ? state.inbox.filter(item => item.reviewQueue).map(item => publicInbox(item) as InboxItem) : [],
    tasks: state.tasks.map(item => structuredClone(item)),
    sync: structuredClone(state.sync),
    backup: {...state.backup, queue: undefined, queueCount: state.backup.queue.length} as unknown as ProjectedLineState['backup'],
  };
  if (role === 'fish') {
    result.taskCandidates = structuredClone(state.taskCandidates);
    result.drafts = structuredClone(state.drafts);
    result.classificationPreferences = structuredClone(state.classificationPreferences);
    result.notifications = structuredClone(state.notifications);
  }
  return result;
}

export function applyRetention(state: LineState, now: number, retentionDays = 90): {removed: number; retained: number} {
  let removed = 0;
  let retained = 0;
  const expiry = now - retentionDays * DAY;
  for (const [key, raw] of Object.entries(state.rawMessages)) {
    if (raw.receivedAt >= expiry || raw.importantHold) {retained += 1; continue;}
    delete state.rawMessages[key];
    removed += 1;
  }
  return {removed, retained};
}

async function deriveBackupKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  const digestValue = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digestValue, {name: 'AES-GCM'}, false, usage);
}

export interface SimulatedBackup {
  format: 'line-sim-backup-v1';
  scope: 'dedicated-line-backup';
  version: number;
  createdAt: string;
  iv: string;
  ciphertext: string;
}

export async function createSimulatedBackup(state: LineState, recoveryKey: string, now = Date.now()): Promise<SimulatedBackup> {
  ok(recoveryKey.length >= 8, 422, 'backup_key_invalid', '復原金鑰長度不符');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupKey(recoveryKey, ['encrypt']);
  const payload = new TextEncoder().encode(JSON.stringify({schemaVersion: 1, state}));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, payload);
  return {format: 'line-sim-backup-v1', scope: 'dedicated-line-backup', version: state.version, createdAt: iso(now), iv: hex(iv), ciphertext: hex(ciphertext)};
}

export async function decryptSimulatedBackup(backup: SimulatedBackup, recoveryKey: string): Promise<LineState> {
  ok(backup?.format === 'line-sim-backup-v1' && backup.scope === 'dedicated-line-backup', 422, 'backup_invalid', '備份格式或範圍不符');
  const key = await deriveBackupKey(recoveryKey, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unhex(backup.iv)}, key, unhex(backup.ciphertext));
    const parsed = JSON.parse(new TextDecoder().decode(plain)) as {schemaVersion: number; state: LineState};
    ok(parsed.schemaVersion === 1 && parsed.state?.schemaVersion === 1, 422, 'backup_invalid', '備份版本不符');
    return parsed.state;
  } catch {
    throw new Problem(422, 'backup_decrypt_failed', '復原金鑰不正確或備份完整性驗證失敗');
  }
}

export function hashForIdempotency(path: string, body: unknown): string { return fingerprint(`${path}|${JSON.stringify(body)}`); }
export function createToken(bytes = 32): string { return randomHex(bytes); }
export function sessionExpiry(now = Date.now()): number { return now + SESSION_IDLE; }
export function resetExpiry(now = Date.now()): number { return now + RESET_TTL; }
export function dayMs(): number { return DAY; }
