---
goal: 新訪客直接透過三步引導建立 SIM 工作區並進入工作台
version: 1.0
date_created: 2026-10-06
last_updated: 2026-10-06
owner: mars-tw
status: In progress
tags: [feature, onboarding, frontend]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

新手進入公開開源試用站後，直接填寫店名、選行業、確認推薦功能並建立系統。建置成功進入自己的工作台，由可收起的引導提供下一個操作入口。

## 1. Requirements & Constraints

- **REQ-001**: 沒有工作區的根網址預設顯示 BuildCenter；已有工作區的根網址顯示原工作總覽。
- **REQ-002**: BuildCenter 第一個步驟包含店名與八個行業，第二步推薦功能，第三步明確確認建立；空白名稱與空模組不得繼續。
- **REQ-003**: 公開確認只呼叫一次既有 setup API。成功直接開工作總覽並將焦點移到店名標題；不自動執行財務或庫存命令。
- **REQ-004**: 第一件工作依啟用模組選擇，教學為選擇入口。進度依歷史與工作狀態判定，示範資料不計完成。
- **REQ-005**: 保留七檔本機建置 ZIP、設定下載、嚴格命令參數與重新啟動。CLI 完成後開啟根網址工作台。
- **SEC-001**: 已有工作區不得由建置精靈覆寫。保留 CSRF、訪客隔離、SIM、版本、pending 原操作代號與資料完整性保護。
- **CON-001**: 僅修改本開源專案，不修改 freedom-platform 正式資料庫，不新增真實支付、登入或正式財務能力。
- **GUD-001**: 320 px 無橫向溢出；支援鍵盤、步驟焦點、減少動態與八種設計偏好。
- **PAT-001**: 使用既有 normalizeLaunchConfig、changeBuilderModules 與 App.run mutation 流程。

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: 建立新手入口與明確建置流程。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | web/BuildCenter.tsx 的三步內容重排；API 本機 defaults 與來源隔離草稿；保留檢查與下載。 | | |
| TASK-002 | web/main.tsx 根網址依 workspace 導向；保留 #custom 舊表單、#design、既有 #learning；setup／retry 成功開 overview。 | | |
| TASK-003 | bin/freedom-erp.mjs 及 bin/browser-opener.mjs 開啟已就緒的本機根網址，保留原 #learning 的嚴格安全白名單。 | | |

### Implementation Phase 2

- **GOAL-002**: 提供不強迫先讀教學的工作台提示，完成驗收與發布。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | web/FirstRunGuide.tsx、web/start-guide.ts 與 CSS 提供實際進度、依模組入口、備份、世代隔離收起與儲存拒絕備援。依賴 TASK-002。 | | |
| TASK-005 | tests/start-guide.test.ts 及 tests/e2e/guided-start.spec.ts 驗證新手、重讀、原 key 恢復、資料不覆寫、無自動交易與手機；適配既有 e2e。 | | |
| TASK-006 | 完成型別、程式、建置、dry-run、完整本機／公開瀏覽器及發布內容檢查；更新手冊與驗收；推送個人 GitHub 並部署既有 SIM 站。依賴 TASK-001 至 TASK-005。 | | |

## 3. Alternatives

- **ALT-001**: 根入口保留一次展示所有模組的舊表單；資訊負擔較高，改保留在 #custom 供明確選用。
- **ALT-002**: 建置後強制進入完整教學；用戶要求直接建立自己的系統，改工作台提示及可選教學。

## 4. Dependencies

- **DEP-001**: 既有模板目錄、normalizeLaunchConfig、LaunchConfig、API setup 及 sessionStorage。
- **DEP-002**: 既有 React、Vite、Wrangler、Playwright；不新增依賴。

## 5. Files

- **FILE-001**: web/main.tsx、web/BuildCenter.tsx、web/build-center.css。
- **FILE-002**: web/FirstRunGuide.tsx、web/start-guide.ts、web/first-run-guide.css。
- **FILE-003**: bin/freedom-erp.mjs、bin/browser-opener.mjs、tests/quickstart-cli.test.mjs。
- **FILE-004**: tests/start-guide.test.ts、tests/e2e/、README.md、docs/quickstart.md、docs/verification.md。

## 6. Testing

- **TEST-001**: npm run typecheck、npm test、npm run build、npm run worker:dry-run、npm run verify:public。
- **TEST-002**: 完整本機 e2e 與公開 HTTPS e2e 分開 output 目錄。新入口 cases 需驗 setup 次數、版本、ledger/orders/庫存初始與隔離。
- **TEST-003**: 建置三步桌面與 320 px 真實截圖回讀；新手完成、返回原工作台、本機 ZIP 與原操作恢復。
- **TEST-004**: 發布包不含憑證、SQLite 或 audit；既有 Worker namespace、72 小時及原訪客資料保持。

## 7. Risks & Assumptions

- **RISK-001**: 舊測試依賴根網址舊表單。一般功能回歸明確使用 #custom，新手流程另驗真正新入口。
- **RISK-002**: sessionStorage 被拒絕時僅能保存當前分頁的引導偏好，重新開啟頁面可能再次顯示。
- **ASSUMPTION-001**: 公開訪客只填模擬資料；本次仍是單訪客 SIM 系統，不宣稱正式營運 ERP 或多人共享。

## 8. Related Specifications / Further Reading

[Quickstart](../docs/quickstart.md) · [Backups](../docs/backups.md) · [Design templates](../docs/design-templates.md) · [AGENTS](../AGENTS.md)
