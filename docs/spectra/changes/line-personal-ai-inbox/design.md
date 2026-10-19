## Context

`freedom-erp-crm` 現在是 Hono／Cloudflare Worker／Durable Object／React／Vite 的公開 SIM 工作台。`src/worker.ts` 以隨機 `freedom_session` cookie 將訪客導向 `BusinessWorkspace`，已有同源、CSRF、版本與冪等檢查，但沒有個人身份、家庭成員、RBAC 或 LINE 收件匣。

本 change 服務 Fish 與家人自用，不是商業 SaaS。第一里程碑先用固定假資料驗證 Dashboard、資料遮罩、權限、待確認、待辦與逐筆回覆流程；真實 `linejs` Connector、AI Provider、Google Drive 與 Email 發送保留為後續 Adapter 接線，不在本輪登入或授權。

## Goals / Non-Goals

**Goals:**

- 在既有 Worker／Durable Object 執行邊界內建立家庭訊息中台的可測試資料與 API 契約。
- 讓 Fish 看完整的中台操作流程，讓家人只能看遮罩摘要、四象限與 Fish 核准的待辦。
- 讓低信心分類、待辦候選、回覆草稿、同步離線與失敗狀態都有明確狀態轉換。
- 保留日後接入 `linejs`、外部 AI、Google Drive 與 Email 的替換介面，不把真實憑證放入 repo 或假資料。

**Non-Goals:**

- 本輪不登入任何 LINE，不讀取或送出真實私人訊息，不驗證 OpenChat 的真實能力。
- 本輪不呼叫外部 AI Provider，不上傳 LINE 原文，不做圖片／PDF／語音理解。
- 本輪不連 Google Drive、不做真實 OAuth、加密檔案上傳或金鑰復原演練。
- 本輪不改變既有公開 ERP／CRM SIM 工作區、模擬金額或既有 API 行為。

## Decisions

### Keep the existing Worker + BusinessWorkspace Durable Object as the runtime boundary

沿用現有 Hono 路由與 Durable Object 儲存模型，新增 LINE 收件匣專用的路由與 keyspace；既有 ERP／CRM API 不直接混入 LINE 領域。若實作需要新的 Durable Object class 或 binding，必須以新增 namespace／migration 的方式處理，不修改既有工作區的資料語意。

替代方案是另建獨立 Node 服務或桌面資料庫。這會讓第一里程碑無法沿用現有公開測試站、部署與隔離測試，故不採用。

### Separate family identity from the existing anonymous demo session

匿名 `freedom_session` 只繼續服務公開 ERP／CRM SIM 工作區。LINE 中台使用獨立的家庭工作區識別、`line_session` HttpOnly cookie、actor role 與 idle expiry；登入後的每個請求都在伺服器端解析家庭工作區與成員權限，不能讓瀏覽器 payload 覆蓋 actor、workspace 或 reviewer。

第一個家庭工作區由 Fish 一次性建立管理員；不提供公開註冊。家人使用獨立帳號。密碼使用 Web Crypto 的 salted password KDF，重設使用 15 分鐘、只能使用一次的 token；第一版以可測試的 Email outbox Adapter 模擬寄送，真實 Email provider 延後。

### Build the first milestone with a local fake connector and rule-based AI adapter

假資料 Connector 提供一對一、一般群組與 OpenChat 三類來源，以及同步狀態、分批歷史補抓、去重與斷線恢復資料。規則式 AI Adapter 固定產生四象限、信心、判斷理由、待辦候選與回覆草稿，讓 UI 與 API 可在沒有外部帳號時驗收。

Connector、AI、通知與備份皆以小型 interface 注入，不在路由內直接呼叫 provider。任何未實作的真實操作回傳清楚的 capability／integration disabled 狀態，不假裝已經連線。

### Keep raw LINE content local and send only masked projections to the cloud UI

第一里程碑的 Cloudflare 資料只存遮罩摘要、來源類型、來源識別、分類、待辦與狀態。完整原文與附件的本機保存由未來 Mac mini Connector 負責；本輪不建立可從家人帳號取得 raw content 的 API。外部 AI 的 payload 只能從遮罩 projection 產生，且未接 provider 時只寫入模擬結果。

替代方案是把完整原文直接存 Durable Object，開發較簡單但違反已確認的資料邊界，故不採用。

### Use append-only audit events and idempotent state transitions

重要操作寫入 append-only audit event，至少包含 actor、家庭工作區、action、target、結果、時間、request／action id 與錯誤碼；家人查詢只能看到自己的操作結果，Fish 才能看完整紀錄。所有寫入沿用 `Idempotency-Key`／版本檢查，候選核准、分類確認、待辦更新與回覆送出在重送時不得產生第二筆結果。

### Make failure state explicit and stop outbound actions while offline

同步狀態至少區分 `online`、`offline`、`backfilling`、`paused` 與 `error`，保存最後成功同步時間與錯誤原因。離線或未通過 OpenChat capability gate 時，回覆送出按鈕與 API 都拒絕；恢復後只補同步，不自動送出先前草稿。寫入採處理中、成功、失敗三態，失敗保留原資料。

### Use a simulated backup adapter before Google Drive integration

第一版只顯示備份 Adapter 的狀態、每小時增量佇列、保留期限與模擬失敗／補傳／還原預覽；不取得 Google OAuth，也不把金鑰或真實備份檔寫入 repo。未來 Google Drive Adapter 必須遵守專用資料夾、先本機加密、90 天輪替與 Fish 才能還原的契約。

## Implementation Contract

### Observable behavior

- Fish 登入後看到待處理收件匣、四象限摘要、待確認項目、同步狀態與假備份狀態。
- 家人登入後只能看到遮罩摘要、四象限與 Fish 已核准待辦；可更新待辦允許的狀態與備註，不能看 raw、分類、草稿或送出回覆。
- 低信心訊息顯示建議分類、信心與理由；Fish 確認後才離開待確認佇列。
- 回覆草稿顯示原始對話摘要、對象、頻道、草稿與附件資訊；Fish 逐筆確認，離線／OpenChat 未通過測試時不可送出。
- Connector 斷線時顯示最後同步時間與離線狀態，停止 outbound action；恢復後補同步並更新狀態。

### Interface and data shape

中台 API 以 `/api/line-inbox/*` 為前綴，登入以 `/api/line-auth/*` 為前綴。API 回應不得暴露 `raw_text` 或未遮罩附件內容。核心投影至少包含：

```ts
type InboxItem = {
  id: string;
  conversationType: 'private' | 'group' | 'openchat';
  maskedSummary: string;
  sourceMessageId: string;
  receivedAt: string;
  quadrant: 'important_urgent' | 'urgent_not_important' | 'not_important_not_urgent' | 'important_not_urgent' | null;
  confidence: number | null;
  reviewReason: string | null;
  syncState: 'online' | 'offline' | 'backfilling' | 'paused' | 'error';
};
```

必要端點的行為契約：

- `POST /api/line-auth/bootstrap`：只允許尚未初始化的部署建立 Fish 管理員。
- `POST /api/line-auth/login`、`POST /api/line-auth/logout`：建立／撤銷家庭工作階段，設定 idle expiry。
- `POST /api/line-auth/password-reset/request`、`POST /api/line-auth/password-reset/complete`：建立 15 分鐘一次性 Email outbox token，完成後立即失效。
- `GET /api/line-inbox`、`GET /api/line-inbox/sync-status`：依 actor scope 回傳遮罩收件匣與同步狀態。
- `POST /api/line-inbox/:id/classification`：Fish 確認或修正分類，保存偏好與 audit event。
- `POST /api/line-inbox/task-candidates/:id/approve`：只有 Fish 可將候選轉成正式待辦，要求 action id 與版本一致。
- `POST /api/line-inbox/replies/:id/send`：只有 Fish 可逐筆送出；offline、OpenChat gate 或 simulated adapter disabled 時回傳可辨識錯誤，不傳送。
- `GET /api/line-inbox/audit`：Fish 讀完整紀錄，家人只讀自己的結果摘要。

### Failure modes

錯誤回應使用既有 `{ error: { code, message } }` 形狀，至少支援 `unauthorized`、`forbidden`、`csrf_failed`、`rate_limited`、`sync_offline`、`capability_disabled`、`idempotency_conflict`、`stale_version` 與 `invalid_transition`。失敗不得刪除原資料、建立半套待辦或把 raw content 放入錯誤訊息／audit log。

### Acceptance criteria

- 後端單元／API 測試覆蓋登入、權限、遮罩、去重、冪等、狀態轉換、保存期限與模擬 Adapter。
- `npm run typecheck`、`npm test`、`npm run build`、`npm run test:e2e`、`spectra analyze line-personal-ai-inbox` 與 `spectra validate line-personal-ai-inbox` 通過。
- 前端以桌面與 320／360／390／414／600／768／820／1024／1180／1440 寬度驗證，收件匣在小於 `860px` 時改成上下卡片；所有可見按鈕都有行為或明確 disabled reason。
- 驗收資料只能是固定假資料與測試帳號；驗收輸出不得包含真實 LINE 原文、Email token、API key 或復原金鑰。

### Scope boundaries

本 change 只交付假資料第一里程碑與可替換 Adapter 契約。真實 `linejs` Connector、真實 LINE 登入／歷史補抓／OpenChat 送出、外部 AI、Google Drive OAuth／加密上傳、真 Email delivery、原始訊息跨裝置查看與自動回覆都必須另開 change。

## Risks / Trade-offs

- [現有匿名 session 與新家庭 session 混淆] → 使用不同 cookie、路由前綴與 Durable Object keyspace，並保留既有 ERP／CRM 回歸測試。
- [第一版假 Connector 讓真實 LINE 能力看起來已完成] → UI 顯示 simulated／disabled 標籤，所有真實整合列入 Non-Goals 與後續 change。
- [Email 重設決策需要外部寄送服務] → 第一版只做 outbox Adapter 與一次性 token 行為測試，不把 provider 憑證或寄信宣稱為已完成。
- [保留與刪除邏輯造成資料遺失] → 原始資料只允許排程依 policy 清理，重要對話需要明確保留標記，備份還原先預覽、不直接覆蓋。

## Migration Plan

1. 以版本化新增的 Durable Object keyspace／migration 建立 LINE 中台資料，不修改既有 ERP／CRM workspace payload。
2. 先以 feature flag 保持 LINE route 關閉，完成 fake seed、單元測試與 API 驗證後再開啟測試頁。
3. 合併後以既有公開 SIM API、CLI、build 與 e2e 回歸；任何資料 schema 失敗都可關閉 feature flag 回到舊工作台。
4. 真實 Connector、AI、Drive 與 Email provider 另行提出 change，不在本輪共用 token 或資料庫。

## Open Questions

- 外部 AI Provider 與 Email delivery provider 尚未選定。
- 家庭外部存取要使用區域網路、VPN／Tailscale 或其他受保護通道尚未選定。
- OpenChat 的真實讀取、歷史補抓與送出能力必須用隔離測試帳號另行驗證。
- 加密備份的檔案格式、金鑰復原演練與真實 Drive OAuth 尚未實作。
