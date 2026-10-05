---
goal: 為台灣小型店家與中小企業建立可分階段實作的企業管理擴充
version: 1.0
date_created: 2026-10-05
last_updated: 2026-10-05
owner: mars-tw
status: Planned
tags: [design, architecture, enterprise, workforce, payroll, finance, simulation]
---

# Introduction

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

本計畫安排企業組織、人資、排班、出勤、薪資結構、資金統計、會計、報稅與發票等功能。主對象是台灣小型店家與中小企業，多分店與工廠列為擴充。這份文件與 `docs/enterprise/blueprint.html` 是設計交付；新增企業模組、資料結構、權限、API 與正式串接均尚未實作。所有階段的 `Completed` 欄保持空白，階段驗收完成後才可更新。

已讀的現有架構：`src/templates.ts:1` 定義依賴、`:2` 定義七個模組；`src/engine.ts:8` 的 `createWorld()` 建立 `schemaVersion:1`、`:12` 的 `validateWorld()` 驗證集合與關聯、`:13` 的 `command()` 執行命令、`:27` 的 `validateIntegrity()` 驗證守恆並遞迴檢查禁用欄位。`src/schema.ts:1` 目前僅重新匯出 `validateWorld()`，不是獨立 schema 實作。`src/worker.ts:12` 的 `BusinessWorkspace.fetch()` 讀取 Durable Object，`:13` 驗證寫入與 32,768-byte 請求、`:16` 處理匯入、`:19` 的 `persist()` 安排公開試用 72 小時清除，`:24` 以隨機訪客 cookie 指派獨立 Durable Object。`web/api.ts:2` 的 `Workspace` 與 `web/main.tsx:20` 的 `labels` 目前只涵蓋既有工作區。

## 1. Requirements & Constraints

- **REQ-001**: 保留現有七個 SIM 模組 ID：`inventory`、`sales`、`wallets`、`services`、`crm`、`projects`、`manufacturing`。保留既有範本與命令行為；`wallets` 是測試幣流水，不能視為銀行模組。
- **REQ-002**: 新增規劃模組 ID 固定為 `enterprise`、`hr`、`scheduling`、`attendance`、`payroll`、`treasury`、`accounting`、`tax`、`invoices`、`procurement`、`assets`、`quality`、`approvals`、`documents`、`analytics`、`recruitment`、`connectors`。規劃 ID 不可直接加入現有 `modules`，必須先完成 TASK-002 至 TASK-006。
- **REQ-003**: 支援 `single`（單店）、`sme`（中小企業、預設）、`multi`（多店／工廠）三種配置。這是功能建議，不能以人數判斷法規適用範圍。每筆企業紀錄具有 `tenant_id`；跨店紀錄另具 `branch_id`，部門與成本中心為分開的識別欄位。
- **REQ-004**: 排班計畫、核准實際出勤、薪資核定、撥付結果分開建模。請假、補登、換班、加班、薪資調整與會計更正必須保留申請與覆核紀錄，不能覆寫來源。
- **REQ-005**: 薪資結構包含固定項、加給、績效、加班、員工扣項與雇主負擔；雇主負擔不得併入員工實領。每一項皆有適用期間、規則版本、來源、幣別與小數處理。法定比率與級距僅採經覆核且具有生效日的設定；公開示例僅使用 SIM 額度與虛構同仁。
- **REQ-006**: `treasury` 提供帳戶分類、現金／存款統計、對帳、資金預測；`accounting` 提供科目、分錄、期間鎖帳；`tax` 提供申報工作底稿與查核；`invoices` 提供號碼與開立／作廢／折讓流程。四者與測試幣帳本分開，草稿與外部確認結果分開。
- **REQ-007**: 採購、驗收、庫存、應付、付款與資產取得具有來源鏈；品質異常、維修、文件版本、簽核與分析使用同一租戶、分店與成本中心邊界。
- **SEC-001**: 先完成組織租戶、使用者身分、伺服器端授權、session 撤銷與稽核。現有 `freedom_session` cookie 是單一訪客的工作區鍵，沒有團隊登入、租戶成員或 RBAC；不得沿用 cookie 作為真員工授權。
- **SEC-002**: 薪資、人事、招募、稅務與帳戶資料分別設定讀取、修改、覆核、匯出權限。權限採預設拒絕；`owner`、`hr_admin`、`manager`、`employee`、`payroll_reviewer`、`finance_admin`、`accountant`、`auditor` 為初始角色。同一人不能覆核自己提出的薪資核定或撥付批次。
- **SEC-003**: 正式個資僅進入經授權的部署與儲存；公開站僅允許虛構資料，無身分證、帳號、真人履歷或實際薪資輸入。日誌不記錄文件內容、帳號或薪資明細；匯出逐項檢查欄位權限並記錄理由、範圍與操作者。
- **SEC-004**: 模擬與正式環境使用不同儲存、密鑰、網路權限與連線設定。正式串接使用專用 adapter、外部憑證儲存及逐請求授權；禁止放寬 `validateIntegrity()` 的金融禁用欄位掃描，或改名繞過現有檢查。
- **CON-001**: 本次不新增企業領域命令、身分權限、資料 engine 或正式連線，只交付文件與純靜態藍圖。建置中心導覽連結、package 的文件打包清單與 build 靜態複製由 root 整合；既有財務拒絕條件保持不變。藍圖不得呼叫 API、發送表單或保存輸入，不得顯示「發薪成功」「報稅成功」等假結果。
- **CON-002**: 現有 `schemaVersion:1` 只接受七模組與既有集合；新增模組須改版 schema、完整關聯驗證、命令白名單、範本依賴、資料遷移及匯入輸出契約，不能只新增 UI 卡片。既有驗證不等於企業資料的完整 strict schema；v2 必須明確拒絕未知鍵。
- **CON-003**: 現有公開寫入上限為 32,768 bytes（含 JSON 包裝）；UI 匯入上限 32,700 bytes，工作區驗證使用 `JSON.stringify(w).length <= 1,000,000`，每集合至多 500 筆。新資料不得塞進舊匯入入口；分批匯入以資料階段、預檢、整批提交與失敗回復取代提高上限。
- **CON-004**: 公開試用目前每次活動延長 72 小時清除，與正式出勤、薪資、稅務、會計文件的留存義務無關。正式部署的保留、刪除、備份與法律保留必須以紀錄種類、法域、起算點與生效日配置，依 TASK-004 覆核結果設定。
- **CON-005**: 規劃完成不表示正式連線得到核准。銀行、稅務、保險／退休金、電子發票及其他對外 adapter 必須最後執行；每一種連線需完成 owner 指定範圍、專業覆核、provider 契約、資安測試及測試環境驗收。正式環境連線另需明確的部署與送出授權。
- **GUD-001**: 對外介面使用台灣繁體中文、具體動作與全形標點。以「待覆核」「設計預覽」「模擬核對」標示狀態，使用者在送出前看得到來源、版本、例外與影響。
- **PAT-001**: 延續 `command()` 的複製後驗證、冪等識別、來源檢查、版本比對與守恆原則。新領域 handler 不直接改寫舊 `World`；以顯式版本轉換與來源事件建立唯讀報表。

## 2. Implementation Steps

### Implementation Phase 0

- **GOAL-001**: 完成租戶、安全與資料契約基礎；驗收為跨租戶與跨角色拒絕測試通過、v1 fixture 可遷移且可回復、公開環境仍拒絕真實金融與個資欄位。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 依 `docs/enterprise/README.md`、`docs/enterprise/workforce-design.md`、`docs/enterprise/finance-design.md` 固定 24 模組與三種配置。計畫新增檔案 `src/enterprise/module-catalog.ts`，實作 `getEnterprisePreset(scale)`，返回固定 ID、依賴與 `mode:'simulation'`；不可在基礎驗收前修改 `src/templates.ts` 的七模組清單。 | | |
| TASK-002 | 計畫新增檔案 `src/enterprise/schema.ts` 與 `src/enterprise/migrations/v1-to-v2.ts`。實作 `validateEnterpriseWorld()` 與純函式 `migrateSimulationV1ToV2()`：schema v2 含 `simulation:true`、`real_finance:false`、`currency:'SIM'`、`tenant_id`、既有資料與具版本的企業集合；所有物件未知鍵拒絕、所有 ID 全域唯一、跨集合與 tenant 引用必須存在。保留 `src/engine.ts` 的 v1 `validateWorld()`；遷移只複製來源，不賦予真人身分或正式財務能力。遷移產出附 `source_schema_version:1`、摘要與回復快照。 | | |
| TASK-003 | 計畫新增檔案 `src/enterprise/auth.ts`、`src/enterprise/roles.ts`、`src/enterprise/worker.ts`。實作 `requireTenantSession(request)`、`authorize(actor,resource,action)`、`revokeSession(id)`、`TenantWorkspace.fetch()`；`organization_id` 與 session 儲存分開，tenant 所有權只由伺服器查得。修改 `src/worker.ts` 的路由前先以獨立測試路由驗收；舊 `BusinessWorkspace` 與 cookie 路徑維持模擬隔離。 | | |
| TASK-004 | 計畫新增檔案 `src/enterprise/privacy.ts`、`src/enterprise/retention.ts` 與 `docs/enterprise/retention-policy.md`。實作 `redactForRole()`、`exportForActor()`、`classifyRecordRetention()`；逐種文件紀錄保存依據、生效日、起算事件、保留期間、刪除例外、法律保留與備份刪除。正式保留值由 owner 與台灣人資／薪資、會計／稅務專業覆核後填入，缺覆核證據的正式功能保持禁用。 | | |
| TASK-005 | 計畫新增檔案 `src/enterprise/import.ts`、`src/enterprise/audit.ts`。實作 `preflightImport()`、`stageImportBatch()`、`commitImportBatch()`、`abortImportBatch()`：每批最大 32,768 bytes、整包 manifest 摘要與批數、每批冪等、提交時版本鎖定、全體引用驗證、原子提交或完整回復。匯出使用相同版本 manifest 及權限去識別；`src/worker.ts` 舊 `/import` 不接受 v2。稽核事件有 actor、tenant、resource、action、before/after 摘要，不含秘密值。 | | |
| TASK-006 | 計畫新增檔案 `tests/enterprise-foundation.test.ts` 與 `tests/enterprise-isolation.e2e.ts`。建立兩個租戶、八角色、到期與撤銷 session、未知鍵、孤立引用、跨租戶 ID、超額 JSON、重送異內容、過時版本、遷移回復、匯出遮罩、公開真實欄位拒絕 fixture；執行 `npm run typecheck`、`npm test` 與對應 e2e，全部通過且 TASK-025、TASK-026 完成才開放 Phase 1。 | | |
| TASK-025 | 計畫新增檔案 `src/enterprise/approvals.ts`；實作 `startApproval()`、`reviewApproval()`、`prepareUnreviewed()`，建立 ReviewCase／ApprovalDecision 與內容 digest，沿用 `docs/enterprise/workforce-design.md` §5.1 狀態契約。maker 與 checker 以 user principal 比對，切換角色或 membership 仍不能自批；returned 建新 revision，approved 原內容不可修改。單人模式只能產 `prepared_unreviewed` 與外部覆核待辦。此基礎於 TASK-007 至 TASK-013 前完成。 | | |
| TASK-026 | 計畫新增檔案 `src/enterprise/documents.ts`、`tests/enterprise-evidence.test.ts`；實作 `versionDocument()`、`readEvidenceForActor()`、`bindEvidenceDigest()`，建立來源文件、內容摘要與只追加版本；每次讀取和匯出驗 tenant、角色及期限，public mode 僅合成文件，無真附件上傳。驗收未知或跨租戶 evidence 拒絕、修改 digest 使待覆核失效、本人／maker 衝突被拒絕與 approved 證據不可覆寫；在 Phase 1 開放前完成。 | | |

### Implementation Phase 1

- **GOAL-002**: 完成人資、任用、文件與招募的 SIM 基礎；依賴 GOAL-001，驗收為任用有效期間、文件版本與候選人授權分開，停用不刪除歷史來源。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-007 | 計畫新增檔案 `src/enterprise/organization.ts`、`src/enterprise/workforce.ts`，實作 `createBranch()`、`assignEmployment()`、`closeEmployment()`；建立分店、部門、職務、成本中心、任用期間與虛構員工檔案。員工與客戶 ID 不共用身分類型；停用員工不刪除歷史出勤與核定來源。依 TASK-003 執行欄位授權。 | | |
| TASK-019 | 在計畫新增檔案 `src/enterprise/recruitment.ts`、`src/enterprise/approvals.ts`、`src/enterprise/documents.ts` 實作 `changeCandidateStage()`、`configureReviewTemplate()`、`bindReviewEvidence()`，依賴 TASK-025、TASK-026 的共用 ReviewCase 與文件來源。新增招募、任用、代理與版本化範本，沿用既有共用 handler，不重新建立基礎簽核。候選人與員工授權分開，交接僅建立 Employment draft，錄用不自動啟用權限；單人店停留 `prepared_unreviewed`，不製造第二覆核者。 | | |

### Implementation Phase 2

- **GOAL-003**: 完成排班與實際出勤的 SIM 流程；依賴 GOAL-002，驗收為計畫與實際紀錄分開、跨日重疊檢查與核准來源成立，變更留痕且自批被拒絕。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-008 | 計畫新增檔案 `src/enterprise/scheduling.ts`，實作 `draftRoster()`、`validateRoster()`、`publishRoster()`、`requestSwap()`；班次含 `timezone:'Asia/Taipei'`、開始／結束、跨日日期、地點、角色與休息區間。檢查重疊、缺人、任用失效與設定的工時限制；法規規則具版本與覆核日期，發布排班不能建立實際出勤。 | | |
| TASK-009 | 計畫新增檔案 `src/enterprise/attendance.ts`，實作 `recordAttendance()`、`requestCorrection()`、`approveAttendance()`、`freezeAttendancePeriod()`；資料源區分打卡、人工補登、請假與加班申請。核准實際分鐘由不可變來源建立；核准人不得為申請人；凍結後修改以調整事件重開，不直接改覆核快照。 | | |
| TASK-010 | 計畫新增檔案 `web/enterprise/WorkforcePreview.tsx`、`tests/enterprise-workforce.test.ts`。建立排班、請假、加班與補登 SIM 預覽；覆蓋跨日班、例假／休息日與特殊出勤類別設定、班次重疊、缺人、換班、退回、核准、自行核准拒絕。不存在個資敏感輸入，public mode 所有紀錄標示虛構。 | | |

### Implementation Phase 3

- **GOAL-004**: 完成薪資結構與核定的 SIM 計算；依賴 GOAL-003 與 TASK-004，驗收為同快照重算得到相同結果、員工扣項與雇主負擔分列，核定不改變銀行餘額。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-011 | 計畫新增檔案 `src/enterprise/payroll-rules.ts`、`src/enterprise/payroll.ts`。實作 `calculatePayroll(snapshot,rules)`：金額用整數 minor unit、固定項／加給／績效／加班／員工扣項／雇主負擔分列，rules 保存生效日與進位與捨去順序。輸入僅來自任用快照與核准出勤，無核准或規則版本缺失時拒絕計算；SIM 樣例不使用未覆核的法定比例。 | | |
| TASK-012 | 計畫新增檔案 `src/enterprise/payroll-review.ts`、`src/enterprise/payroll-slip.ts`。實作 `snapshotPayroll()`、`previewPayroll()`、`submitPayrollReview()`、`approvePayrollRun()`、`releaseSimulatedPayroll()`、`voidPayrollRun()`、`renderSimulationSlip()`，沿用 `docs/enterprise/workforce-design.md` §5.5 canonical：`draft → ready → previewed → in_review → approved → released`。`ready/previewed/in_review` 的來源 digest 改變轉 `stale`，`refresh_snapshot` 建新 revision 並使舊審核失效；`approved/released` 不得 refresh。approved 發現錯誤於 release 前使用 `void_before_release`；released 更正新增 adjustment run，引用原單與差額來源，不改舊核定快照。`release_simulated` 只發布本人可見 SIM 薪資單與成本分攤，顯示「模擬薪資，未付款」，不改 wallets／ledger 或銀行；沒有 paid／bank_sent／filed 狀態。 | | |
| TASK-013 | 計畫新增檔案 `web/enterprise/PayrollPreview.tsx`、`tests/enterprise-payroll.test.ts`。驗證固定項與變動項、跨期調整、負數扣項拒絕、整數溢出、重複來源、同人自批、雇主負擔不進淨額、快照不可變與員工僅讀本人薪資。公開畫面按鈕只演示流程；沒有建立撥款或申報請求的 handler。 | | |

### Implementation Phase 4

- **GOAL-005**: 完成資金統計、會計與營運的 SIM 模組；依賴 GOAL-001、GOAL-004，驗收為對帳來源可追、借貸平衡與鎖帳成立、跨店數量與成本守恆、報表不跨權限。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-014 | 計畫新增檔案 `src/enterprise/treasury.ts`、`src/enterprise/reconciliation.ts`；實作 `summarizeCashPosition()`、`matchStatementRows()`、`forecastCash()`。模擬帳戶只有 `SIM-CASH-01` 等示範 ID；對帳來源與帳簿分開，自動配對結果待人工覆核，差異保留。不得從現有 `wallets` 推導真存款餘額。 | | |
| TASK-015 | 計畫新增檔案 `src/enterprise/accounting.ts`、`src/enterprise/period-close.ts`；實作 `postSimulationJournal()`、`reverseJournal()`、`closePeriod()`。借貸總額相等、journal 引用核准業務來源、相同來源不得重複入帳，已過帳內容不可覆寫，結帳後只能在開放期間反向／調整；SIM ledger 與正式總帳永不混寫。 | | |
| TASK-017 | 計畫新增檔案 `web/enterprise/FinancePreview.tsx`、`tests/enterprise-finance.test.ts`；覆蓋跨期歸屬、未平衡分錄、重複來源、鎖帳、對帳差異、一筆多配、核定薪資≠付款、外部確認缺失禁止成功。公開環境所有金額與文件皆SIM，連接功能返回 `connector_disabled`。 | | |
| TASK-018 | 計畫新增檔案 `src/enterprise/procurement.ts`、`src/enterprise/assets.ts`、`src/enterprise/quality.ts`，實作 `requestPurchase()`、`approvePurchase()`、`receivePurchase()`、`registerAsset()`、`recordQualityIssue()`。採購先申請後核准，驗收引用訂單，庫存進出與舊 FIFO 守恆對齊；部分驗收不生成全額付款。資產與維修、品質異常與批次關聯，跨租戶引用拒絕。 | | |
| TASK-020 | 計畫新增檔案 `src/enterprise/analytics.ts`、`src/enterprise/branch-transfer.ts`、`web/enterprise/OperationsPreview.tsx`、`tests/enterprise-operations.test.ts`；實作 `buildAuthorizedMetrics()`、`transferStock()`。統計採用同期間、SIM幣別與來源版本，角色看不到被遮罩的薪資；跨店出入庫同 transaction 引用，數量與成本守恆。`single/sme/multi` 僅改變導航及建議啟用，不放寬權限。 | | |

### Implementation Phase 5

- **GOAL-006**: 完成稅務工作底稿與憑證／發票的 SIM 流程；依賴 GOAL-005，驗收為種類、期間、來源與版本可核對，作廢與折讓來源完整，正式申報與開立入口仍禁用。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-016 | 計畫新增檔案 `src/enterprise/tax-workpapers.ts`、`src/enterprise/invoice-workflow.ts`；實作 `buildTaxWorkpaper()`、`validateInvoiceDraft()`、`simulateInvoiceTransition()`。依據 `docs/enterprise/finance-design.md` 區分申報種類、期間、版本與覆核資料；發票示範號 `SIM-INV-0001`，僅有 `draft/review_pending/simulation_recorded/void_review/adjustment_review`，不產生正式號碼與未確認成功狀態。報稅底稿不能標記已申報。 | | |
| TASK-024 | 計畫新增檔案 `web/enterprise/TaxInvoicePreview.tsx`、`tests/enterprise-tax-invoices.test.ts`；實作 `renderTaxInvoicePreview()` 並驗證底稿期間、適用規則缺件、發票原單、作廢與折讓來源、SIM 號碼、資料包遮罩與草稿來源變動。草稿完成不代表正式申報或開立；公開環境所有正式送出均回傳 `connector_disabled`。 | | |

### Implementation Phase 6

- **GOAL-007**: 在獨立正式部署中逐項驗收外部 adapter；依賴所有前置階段，驗收為每項均有具體 owner 授權、專業覆核、provider 測試證據與外部確認來源，公開 SIM 站零正式網路連線。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-021 | 計畫新增檔案 `docs/enterprise/connector-gates.md`、`src/enterprise/connectors/gates.ts`；實作 `evaluateConnectorGate()`。每項銀行、電子發票、報稅、勞健保／退休金 adapter 記錄 owner、法域與業務範圍、法務／稅務／人資覆核者、覆核日期、provider 契約、credentials 所在引用、測試環境證明、資安與回復測試、正式環境送出授權。任一欄位或證據缺失返回 disabled，規劃文件不能用作 gate 授權證據。 | | |
| TASK-022 | 計畫新增檔案 `src/enterprise/connectors/adapter.ts`、`src/enterprise/connectors/callback.ts`、`src/enterprise/connectors/submission.ts`；定義 `ExternalAdapter`、`verifyProviderCallback()`、`submitApprovedBatch()`。具 provider 與環境白名單、簽章驗證、重送與過時拒絕、外部 reference、pending/unknown/confirmed/rejected 狀態與對帳；超時保持 unknown 並查原筆，不能重複送出或假稱成功。逐 provider 在 sandbox 驗收後才新增正式 adapter 檔案，名稱與介面寫回 connector gate。 | | |
| TASK-023 | 計畫新增檔案 `tests/enterprise-connectors.test.ts`、`tests/enterprise-public-boundary.e2e.ts`，驗證 simulation mode 拒絕任意正式 adapter、篡改回呼、自簽核、重送異內容、未知結果、撤銷憑證與 gate 缺項。正式上線前執行安全、備份還原、資料刪除、對帳與無障礙驗收；僅在 owner 針對實際 connector 與部署完成授權後進行正式發布。 | | |

## 3. Alternatives

- **ALT-001**: 在 v1 `World` 直接追加人事與銀行集合。未採用，因七模組白名單、引用驗證、匯入大小與金融禁掃無法證明企業授權及資料安全；先完成版本化契約。
- **ALT-002**: 以現有訪客 cookie 邀請團隊共用工作區。未採用，因 cookie 沒有使用者身分、角色或組織成員關係；改為正式租戶 session。
- **ALT-003**: 以提高公開匯入上限支援大型企業。未採用，因一次載入全體個資與薪資增加風險且不能保證原子性；採有 manifest 的分批預檢與提交。
- **ALT-004**: 在薪資試算後自動發薪與報稅。未採用，因計算、覆核與外部確認是不同事件；正式 adapter 必須在 Phase 6 逐項驗收。

## 4. Dependencies

- **DEP-001**: 現有 Hono Worker、Durable Object、TypeScript、React、Vite、Node 測試與 Playwright 流程。以 `package-lock.json` 鎖定版本為基準，本計畫不要求新增套件。
- **DEP-002**: GOAL-002 依賴 GOAL-001；GOAL-003 依賴 GOAL-002；GOAL-004 依賴 GOAL-003 與 TASK-004；GOAL-005 依賴 GOAL-001 與 GOAL-004；GOAL-006 依賴 GOAL-005；GOAL-007 依賴全部前置階段。Phase 內未指出依賴的獨立文件可平行實作，但共用 schema 修改由單一負責者整合。
- **DEP-003**: 正式人資、薪資、會計、報稅、發票與保存規則需要台灣適用情境及專業覆核證據；文件中的來源核對只是設計依據，不能取代實際企業適用審查。
- **DEP-004**: 外部 provider 由 owner 在 TASK-021 指定，完成契約、sandbox、正式環境授權與憑證配置前不安裝、不連線、不發送。

## 5. Files

- **FILE-001**: 現有基準 `src/engine.ts`、`src/schema.ts`、`src/templates.ts`、`src/worker.ts`、`web/api.ts`、`web/main.tsx`、`wrangler.jsonc`。本次不修改企業資料與 API 行為；root 僅在 `web/main.tsx` 加入頁尾設計藍圖連結。另由 root 整合 `package.json` 的 spec／plan 打包項目與 `scripts/copy-notices.mjs` 的靜態複製。未來領域實作需保留七模組、v1 匯入與隔離回歸。
- **FILE-002**: 設計交付 `docs/enterprise/blueprint.html` 與本檔 `plan/design-enterprise-suite-v1.md`；靜態頁面複製到 `dist/enterprise-plan.html` 由根任務處理。本檔是 `Planned`，並非功能驗收報告。
- **FILE-003**: 計畫新增檔案群 `src/enterprise/module-catalog.ts`、`src/enterprise/schema.ts`、`src/enterprise/migrations/v1-to-v2.ts`、`src/enterprise/auth.ts`、`src/enterprise/roles.ts`、`src/enterprise/worker.ts`、`src/enterprise/privacy.ts`、`src/enterprise/retention.ts`、`src/enterprise/import.ts`、`src/enterprise/audit.ts`、`src/enterprise/approvals.ts`、`src/enterprise/documents.ts`；具體函式與驗收見 TASK-001 至 TASK-006、TASK-025、TASK-026。
- **FILE-004**: 計畫新增檔案群 `src/enterprise/organization.ts`、`src/enterprise/workforce.ts`、`src/enterprise/scheduling.ts`、`src/enterprise/attendance.ts`、`src/enterprise/payroll-rules.ts`、`src/enterprise/payroll.ts`、`src/enterprise/payroll-review.ts`、`src/enterprise/payroll-slip.ts`；見 TASK-007 至 TASK-013。
- **FILE-005**: 計畫新增檔案群 `src/enterprise/treasury.ts`、`src/enterprise/reconciliation.ts`、`src/enterprise/accounting.ts`、`src/enterprise/period-close.ts`、`src/enterprise/tax-workpapers.ts`、`src/enterprise/invoice-workflow.ts`、`src/enterprise/procurement.ts`、`src/enterprise/assets.ts`、`src/enterprise/quality.ts`、`src/enterprise/approvals.ts`、`src/enterprise/documents.ts`、`src/enterprise/recruitment.ts`、`src/enterprise/analytics.ts`、`src/enterprise/branch-transfer.ts`；見 TASK-014 至 TASK-020。
- **FILE-006**: 計畫新增檔案群 `src/enterprise/connectors/gates.ts`、`src/enterprise/connectors/adapter.ts`、`src/enterprise/connectors/callback.ts`、`src/enterprise/connectors/submission.ts`，`docs/enterprise/connector-gates.md`、`docs/enterprise/retention-policy.md`；見 TASK-004、TASK-021、TASK-022。provider 專用檔案僅在具體 gate 確定後建立。
- **FILE-007**: 計畫新增檔案群 `web/enterprise/WorkforcePreview.tsx`、`web/enterprise/PayrollPreview.tsx`、`web/enterprise/FinancePreview.tsx`、`web/enterprise/TaxInvoicePreview.tsx`、`web/enterprise/OperationsPreview.tsx` 與 `tests/enterprise-*.test.ts`、`tests/enterprise-*.e2e.ts`；TASK 表列的是擬建頁面與測試，並非現有 runtime。

## 6. Testing

- **TEST-001**: 設計交付檢查：讀回 HTML 與 Markdown；宣告 ID 每個只出現一次，所有 mandatory headers 存在，status 為 Planned，任務完成欄為空；HTML CSP 拒絕連線與表單，無 fetch/XHR、外部資源、敏感表單與 browser storage。
- **TEST-002**: 靜態藍圖操作檢查：在 320、768、1440px 開啟三種規模、五個頁簽、關鍵字搜尋、清除與空結果，點擊 `hr/scheduling/payroll/treasury/tax/invoices` 後預覽具設計標示；Tab 與方向鍵可導航，focus 清楚，reduced-motion 無必要動畫。此為藍圖驗收，不代表企業功能已實作。
- **TEST-003**: 基礎未來驗收：TASK-006 的租戶／角色矩陣、strict v2 schema、版本遷移、孤立引用、敏感匯出、保存與刪除、原子批次與回復全部通過。
- **TEST-004**: 業務未來驗收：TASK-010、TASK-013、TASK-017、TASK-020、TASK-024、TASK-026 的跨日工時、薪資一致性、來源/借貸/FIFO守恆、鎖帳與權限 fixture 全部通過。
- **TEST-005**: 正式串接未來驗收：TASK-023 的 gate 與 sandbox 證據完整，callback 可驗證與冪等，未知結果不標成功；公開站所有正式 requests 拒絕。
- **TEST-006**: 每個 runtime 實作階段運行 `npm run typecheck`、`npm test`、`npm run build` 與對應 Playwright 案例。正式發布前再執行 `npm run verify:public` 與 `npm run worker:dry-run`，基礎 SIM 隔離、清除、冪等與匯入輸出回歸不得失敗。

## 7. Risks & Assumptions

- **RISK-001**: 企業適用規則因僱用型態、工時制度、身分、產業、稅別與生效日不同；缺少覆核的配置會錯算。正式功能在 TASK-004、TASK-021 缺證時禁用。
- **RISK-002**: 現有 monolithic v1 validator 的 collection 白名單與遞迴金融禁掃不可承接正式企業資料；放寬檢查會破壞公開界線。使用獨立 v2 SIM 契約與正式 adapter 隔離。
- **RISK-003**: 財務結果超時可能被使用者重送；缺乏外部 reference 與對帳會重複付款或重複開票。unknown 狀態只允許查詢原請求。
- **RISK-004**: 薪資與履歷資料容易在報表、匯出、附件與稽核日誌間洩漏；每個讀取路徑均使用角色遮罩及租戶過濾，不只隱藏UI。
- **RISK-005**: 公開 72 小時清除與正式文件保留衝突；必須從部署、資料分類與備份層分開，不能改一個全域天數處理。
- **ASSUMPTION-001**: 本次使用者要求安排設計，主對象為台灣小型店家與中小企業；未提供特定企業的真人員工、帳戶、統編、稅籍或 provider。所有示例僅為虛構SIM。
- **ASSUMPTION-002**: root 任務負責其餘規格、來源文件、靜態產物複製與公開demo整合。本檔不宣告 commit、push、部署或正式連線已完成。

## 8. Related Specifications / Further Reading

- [企業擴充規格](../spec/spec-design-enterprise-suite.md)
- [企業管理設計總覽](../docs/enterprise/README.md)
- [人資、排班與薪資設計](../docs/enterprise/workforce-design.md)
- [資金、會計、稅務與發票設計](../docs/enterprise/finance-design.md)
- [互動設計藍圖](../docs/enterprise/blueprint.html)
- [既有工作區設計](../docs/workbench.md)
- [現有部署說明](../docs/deployment.md)
