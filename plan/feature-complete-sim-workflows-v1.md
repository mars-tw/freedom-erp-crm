---
goal: 完成現有 SIM 店務與行政的閉環、報表、備份及操作驗收
version: 1.0
date_created: 2026-10-05
last_updated: 2026-10-05
owner: mars-tw
status: In progress
tags: [feature, quality, workflows, backup, simulation]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In_progress-yellow)

本輪把目前已提供的八個 SIM 模組做成可完整跑通的測試版：建立資料、修改、更正、作廢／取消、查看來源、報表、備份及還原都有實際流程。公開功能不以規劃卡片或只可新增的表單當完成。完整企業身份、真薪資、銀行及正式稅務依原範圍仍不接入。

## 1. Requirements & Constraints

- **REQ-001**: 班次可編輯，手動出勤可附理由更正及作廢，設備預約可改期，公告可封存還原；保留原值、新值與時間，同人／設備衝突失敗整批不寫。
- **REQ-002**: store／office／factory 三種合成示範只可加入全空行政桌，一個操作建立完整入門資料；已有資料不能被覆蓋。三步上手可直接定位組織、人員與班次。
- **REQ-003**: 依目前篩選匯出 CSV／列印，清楚列 SIM、來源、時區、週與狀態條件；CSV 保護引號、換行與公式前綴，純讀取不修改資料。
- **REQ-004**: 系統自己的有效備份可完整還原，超過 32 KB 使用分段、摘要、接續、取消及最終一次驗證提交；傳輸途中工作區不被清空或部分取代。
- **REQ-005**: 大型有效工作區不超過 SQLite 單一儲存值限制；以原子 state 片段儲存且讀取舊 plain state 相容，重新啟動保持資料與版本。
- **SEC-001**: 保留訪客隔離、同源、CSRF、版本、冪等、SIM、欄位及引用驗證。備份分段每個請求仍小於 32,768 bytes；不同訪客不能讀／提交別人的傳輸。
- **CON-001**: 工作區 JSON 字串長度 1,000,000 及集合配額仍有效；資料傳輸不能繞過原完整性，真金融、憑證、身份資訊及未知鍵仍拒絕。
- **CON-002**: 已核定真人出勤、法定假額、薪資、銀行、稅務、發票、多人企業身份沒有實作，不可因本輪品質提升宣告完成。
- **GUD-001**: 所有成功通知對應真結果，取消沒有寫入，失敗表單保留內容；未來班次不顯示已結束，停用／作廢／封存狀態可明確回看。

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: 完成資料閉環與舊行政格式相容。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | `src/administration.ts` 新增原因更正、出勤作廢、預約改期、公告封存還原及只追加 changes；舊 format1 GET 不補寫，成功命令才加入 optional 預設；`src/engine.ts` 報表排除 voided／archived。 | Yes | 2026-10-05 |
| TASK-002 | 實作 office.demo.create 的三種完整合成資料，空白判斷、有效 UUID／引用／日期與一個原子操作；不修改舊商品、客戶、錢包或流水。 | Yes | 2026-10-05 |
| TASK-003 | `web/AdministrationDesk.tsx`／model／CSS 提供三步入門、原因表單、狀態篩選、紀錄定位、歷程、CSV、列印與明確空狀態。 | Yes | 2026-10-05 |

### Implementation Phase 2

- **GOAL-002**: 完成可還原的大型備份與持久化。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | `src/workspace-backup.ts` 實作 begin／part／status／abort／assemble，3 MiB、24,000-byte 片段、15 分鐘期限、來源 SHA-256、原版本與重送檢查。 | Yes | 2026-10-05 |
| TASK-005 | `src/workspace-storage.ts` 相容 plain state，超過 1.5 MB 序列化資料採分段原子儲存、內容摘要與完整讀取；舊資料不因讀取而改世代。 | Yes | 2026-10-05 |
| TASK-006 | `src/worker.ts` 沿用請求保護與收據，commit 完整 validateWorld 後才一次替換；清除／還原能在收據容量已滿時安全接續並保持過時版本不可復活。 | Yes | 2026-10-05 |
| TASK-007 | `web/workspace-backup.ts`／`BackupRestoreDialog.tsx`／`web/main.tsx` 提供選檔預覽與確認、取消、進度、rate 控流、同檔重選接續及原操作結果恢復。 | Yes | 2026-10-05 |

### Implementation Phase 3

- **GOAL-003**: 實際驗收及公開更新。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-008 | 執行領域、實際 API、大中文備份／重啟、店家與辦公室完整瀏覽器旅程、CSV／print、preview取消、失去回應恢復、手機與舊功能回歸。 | | |
| TASK-009 | 型別、build、Worker dry-run、包內容、私人狀態排除、GitHub／CI、公開內容與訪客資料保存核對全部完成，再標記本計畫 Completed。 | | |

## 3. Alternatives

- **ALT-001**: 只提高舊 JSON request 上限。未採用，避免未驗證大請求及存入半份資料；使用分段驗證與一次提交。
- **ALT-002**: 更正直接覆寫而不記原因。未採用，原值與新值需可追查，作廢保留原紀錄。
- **ALT-003**: 所有未來企業模組一律標完成。未採用，本輪以可驗收的模擬流程完成度交付，不假造正式能力。

## 4. Dependencies

- **DEP-001**: 既有 Workers SQLite DO、Hono、React、Node、Vite、Playwright；不新增第三方套件。
- **DEP-002**: TASK-003 依賴 TASK-001／TASK-002；TASK-007 依賴 TASK-004 至 TASK-006，瀏覽器前先 build。
- **DEP-003**: 公開 namespace、public flags、每位訪客的 cookie 及舊 schema1 保護保持原設定。

## 5. Files

- **FILE-001**: `src/administration.ts`、`src/engine.ts`、`src/workspace-backup.ts`、`src/workspace-storage.ts`、`src/worker.ts`。
- **FILE-002**: `web/AdministrationDesk.tsx`、`web/administration-model.ts`、`web/administration.css`、`web/api.ts`、`web/workspace-backup.ts`、`web/BackupRestoreDialog.tsx`、`web/quality-tools.css`、`web/main.tsx`。
- **FILE-003**: `tests/administration.test.ts`、`tests/administration-api.test.ts`、`tests/workspace-backup.test.ts`、`tests/e2e/administration.spec.ts`、操作／備份／驗收文件及本計畫。

## 6. Testing

- **TEST-001**: 更正來源、原因、不可變識別、時間、參照、重疊、舊格式、歷程 quota、作廢排除及空白示範拒重建。
- **TEST-002**: 真實 API 大於 2 MiB 的中文有效工作區還原及重啟；來源 hash、UTF8、JSON、私密／金融欄位、跨訪客與版本拒絕，錯誤不部分寫入。
- **TEST-003**: 真瀏覽器完整示範、更正／作廢／重建、預約／歸還／重訂、封存／還原、CSV、列印、備份預覽取消／還原、原 key 結果恢復。
- **TEST-004**: 原八產業、七項店務核心、教學、搜尋、外觀、CLI、公開資產與非模擬輸入拒絕的完整回歸。

## 7. Risks & Assumptions

- **RISK-001**: 大備份可能遇到 rate、網路或版本變化；分段不是完成，未完整驗證前不取代資料，commit 後用原收據確認。
- **RISK-002**: 列印與 CSV 可能被誤作正式資料；所有輸出標示 SIM、來源及範圍，不使用法定表單名稱。
- **ASSUMPTION-001**: 使用者原先限定假商品與模擬金仍有效，本輪改善完成度沒有擴大到真銀行、真人員工或正式申報。

## 8. Related Specifications / Further Reading

- [行政操作](../docs/administration.md)
- [完整企業設計](../spec/spec-design-enterprise-suite.md)
- [原行政試用](feature-administration-pilot-v1.md)
- [公開驗收](../docs/verification.md)
- [Cloudflare SQLite 儲存與交易](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Cloudflare Durable Object 儲存限制](https://developers.cloudflare.com/durable-objects/platform/limits/)
