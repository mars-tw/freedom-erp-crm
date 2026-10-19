## Why

Fish 與家人每天會收到大量 LINE 個人、群組與 OpenChat 訊息，重要內容容易被雜訊淹沒。`freedom-erp-crm` 已有 Cloudflare Worker、Durable Object 與可操作的模擬工作台，但還沒有家庭帳號、LINE 收件匣中台、四象限整理與受控回覆流程；現在先建立可驗收的第一里程碑，才能在接觸真實 LINE 前驗證資料邊界與操作方式。

## What Changes

- 新增 LINE 個人訊息中台的假資料領域：一對一、一般群組、OpenChat、同步狀態、去重、四象限、待確認佇列、待辦候選與回覆草稿。
- 新增 Fish 管理員與家人帳號、角色權限、登入工作階段、Email 密碼重設與操作紀錄。
- 新增遮罩後的 Dashboard：待處理收件匣、四象限摘要、待辦協作、低信心分類確認、Fish 逐筆回覆確認與同步狀態。
- 新增規則式假資料 Connector、模擬 AI Adapter、通知 Adapter 與備份 Adapter，讓第一版不依賴真實 LINE、AI Provider 或 Google Drive。
- 以 API、Durable Object 儲存與前後端 Gherkin／Playwright 驗收劇本固定資料邊界、失敗狀態、冪等與權限契約。

## Non-Goals (optional)

真實 `linejs` 登入與同步、真實 OpenChat 能力驗證、外部 AI Provider、Google Drive OAuth／加密上傳、瀏覽器原生通知、真正 Email 寄送與主帳號送出訊息都不在這個第一里程碑內。

## Capabilities

### New Capabilities

- `line-inbox-workbench`: 提供遮罩收件匣、四象限、待確認、待辦候選與逐筆回覆確認的中台工作台。
- `family-access-control`: 提供 Fish／家人帳號、角色權限、登入工作階段、密碼重設與 CSRF／限速邊界。
- `audit-and-data-boundary`: 提供原始資料不外洩、遮罩投影、操作紀錄、保存期限與 Fish 專屬通知邊界。
- `backup-and-connector-boundaries`: 提供 Connector／AI／備份 Adapter 的模擬契約、同步中斷狀態與本機佇列行為。

### Modified Capabilities

無。現有 ERP／CRM 模擬能力的需求不變，本 change 只新增 LINE 個人訊息中台能力。

## Impact

- `src/worker.ts`、`src/engine.ts`、`src/schema.ts` 與 Durable Object 儲存層：新增中台路由、版本化資料結構、權限與冪等檢查。
- `web/`：新增或接入 LINE 收件匣 Dashboard、登入／重設密碼、家人檢視與同步狀態元件；沿用現有 SVG icon 與既有樣式邊界。
- `tests/` 與 `e2e/`：新增後端 API、權限、資料邊界、狀態轉換與桌面／手機工作台驗收。
- 不新增 npm 依賴；外部 LINE、AI、Google Drive 與 Email 通道以介面和可替換的假 Adapter 保留後續接線點。
- 既有匿名公開 SIM 工作區、現有 ERP／CRM API 與資料不應被覆蓋或改變行為。
