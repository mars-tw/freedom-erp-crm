import {
  createSimulatedBackup,
  createToken,
  ingestLineMessage,
  resetExpiry,
  type ConversationType,
  type InboxItem,
  type LineMessageInput,
  type LineState,
  type Quadrant,
  type SimulatedBackup,
} from './line-inbox.js';

export interface LineAiAnalysis {
  confidence: number;
  suggestedQuadrant: Quadrant;
  reviewReason?: string;
}

export interface LineConnectorAdapter {
  readonly kind: 'simulated' | 'disabled';
  ingest(state: LineState, input: LineMessageInput): ReturnType<typeof ingestLineMessage>;
  continueBackfill(state: LineState, now: number, simulateFailure: boolean): {failed: boolean; completed: number};
}

export interface LineAiAdapter {
  readonly kind: 'simulated' | 'disabled';
  analyze(state: LineState, input: LineMessageInput): LineAiAnalysis;
}

export interface LineNotificationAdapter {
  readonly kind: 'simulated' | 'disabled';
  publish(state: LineState, item: InboxItem, now: number): void;
}

export interface LineEmailAdapter {
  readonly kind: 'simulated' | 'disabled';
  enqueueReset(state: LineState, accountId: string, now: number): {token: string; expiresAt: number};
}

export interface LineBackupAdapter {
  readonly kind: 'simulated' | 'disabled';
  create(state: LineState, recoveryKey: string, now: number): Promise<SimulatedBackup>;
}

export interface LineAdapters {
  connector: LineConnectorAdapter;
  ai: LineAiAdapter;
  notifications: LineNotificationAdapter;
  email: LineEmailAdapter;
  backup: LineBackupAdapter;
}

const defaultQuadrant = (input: LineMessageInput, preference?: Quadrant): Quadrant => {
  if (input.suggestedQuadrant) return input.suggestedQuadrant;
  if (preference) return preference;
  if (input.conversationType === 'openchat') return 'not_important_not_urgent';
  if (/明天|今天|期限|截止|立刻|現在/.test(input.rawText)) return 'important_urgent';
  if (input.conversationType === 'group') return 'urgent_not_important';
  return 'important_not_urgent';
};

export function createSimulatedLineAdapters(): LineAdapters {
  return {
    connector: {
      kind: 'simulated',
      ingest: (state, input) => ingestLineMessage(state, input),
      continueBackfill: (state, now, simulateFailure) => {
        if (simulateFailure) {
          state.sync.state = 'error';
          state.sync.lastError = '歷史補抓暫時失敗，已保留已完成批次';
          return {failed: true, completed: 0};
        }
        state.sync.state = 'backfilling';
        const completed = Math.min(state.sync.backfillBatchSize, state.sync.backfillRemaining);
        state.sync.backfillCompleted += completed;
        state.sync.backfillRemaining -= completed;
        if (state.sync.backfillRemaining === 0) {
          state.sync.state = 'online';
          state.sync.lastSuccessfulAt = new Date(now).toISOString();
          state.sync.lastError = null;
        }
        for (const item of state.inbox) item.syncState = state.sync.state;
        return {failed: false, completed};
      },
    },
    ai: {
      kind: 'simulated',
      analyze: (state, input) => {
        const preference = state.classificationPreferences.find(value => value.pattern === input.conversationType)?.quadrant;
        const confidence = Math.min(1, Math.max(0, input.confidence ?? (input.conversationType === 'openchat' ? 0.95 : 0.88)));
        return {
          confidence,
          suggestedQuadrant: defaultQuadrant(input, preference),
          ...(confidence < 0.75 ? {reviewReason: input.reviewReason ?? 'AI 信心低於確認門檻。'} : {}),
        };
      },
    },
    notifications: {
      kind: 'simulated',
      publish: (state, item, now) => {
        if (item.quadrant !== 'important_urgent' || state.notifications.some(value => value.href.includes(item.id))) return;
        state.notifications.push({id: createToken(12), recipientRole: 'fish', summary: item.maskedSummary, href: `/line-inbox-demo.html#inbox-${item.id}`, createdAt: new Date(now).toISOString()});
      },
    },
    email: {
      kind: 'simulated',
      enqueueReset: (state, accountId, now) => {
        const token = createToken(24);
        const expiresAt = resetExpiry(now);
        state.emailOutbox.push({id: createToken(12), accountId, token, createdAt: now, expiresAt, usedAt: null});
        return {token, expiresAt};
      },
    },
    backup: {
      kind: 'simulated',
      create: (state, recoveryKey, now) => createSimulatedBackup(state, recoveryKey, now),
    },
  };
}

export type SimulatedConversationType = ConversationType;
