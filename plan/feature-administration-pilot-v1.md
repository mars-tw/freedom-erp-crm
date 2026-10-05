---
goal: 建置店家與中小企業可操作的個人行政模擬工作台
version: 1.0
date_created: 2026-10-05
last_updated: 2026-10-05
owner: mars-tw
status: Completed
tags: [feature, administration, simulation, store, sme]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

本輪以實際資料操作完成行政試用：據點／部門、假員工、班表、手動出勤、行政申請、設備、借用、公告。每位訪客仍有自己的 SIM 工作區；這是獨立的 `administration` 小型模組，不把企業藍圖的十七個完整模組或 Phase 0 身份驗證宣告完成。

## 1. Requirements & Constraints

- **REQ-001**: 新增 `administration` 第八個可用模組；一般企業範本 version 2 預設啟用，其他產業沿用舊預設並可選配。已存在的工作區只在明確執行 `office.enable` 時加入，保留 generation、舊業務資料與財務數字。
- **REQ-002**: 八個集合使用 `freedom-administration-v1` 版本契約、嚴格欄位、全域識別與同工作區引用。舊 schemaVersion 1 且未啟用行政的資料仍有效，已有行政內容不能用重複啟用覆寫。
- **REQ-003**: 班次／出勤分開記錄，支援跨夜、分鐘與休息時間、同人重疊拒絕、週班表複製與失敗原子回復。沒有法定工時、打卡、核准出勤或薪資計算保證。
- **REQ-004**: 申請支援請假、請購、費用估額及一般事項；草稿、送出、退回補資料、撤回與整理完成分開。整理完成為 `prepared_unreviewed`，不能表示獨立簽核通過、准假、付款或正式會計認列。
- **REQ-005**: 設備借用檢查重疊、維修與停用限制，歸還後可重新借用；公告提供置頂、期限、修改與搜尋。所有統計只讀取已儲存行政資料。
- **SEC-001**: 保留 Worker 現有同源、CSRF、版本、冪等與訪客隔離。UI 不能用角色切換冒充第二核准人；未知命令、來源與受保護欄位仍拒絕。
- **SEC-002**: 行政只使用假員工代稱與合成資料，不新增身份證、銀行帳號、真人聯絡資料、GPS、生物辨識、正式憑證或外部傳輸。
- **CON-001**: 本輪保留單訪客儲存、32,768-byte 請求上限、工作區 JSON 字串長度與既有 SIM 守恆。較大工作區可匯出，但不能宣稱必能在 32 KB 匯入上限內還原。
- **CON-002**: 完整多人企業身份、分店／員工權限、法律政策包、正式留存、薪資、銀行、會計、報稅、發票與 connector 仍依原設計另行開發驗收。
- **GUD-001**: 沿用既有深／淺色與資訊密度，鍵盤可操作，320 px 不溢出；表單取消不寫入、busy／pending 禁止重複送出，錯誤保留可修正內容。

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: 完成有版本的行政領域與現有 API 整合。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | 新增 `src/administration.ts`，實作 createAdministration／applyAdministration／validateAdministration；八集合 strict schema、關聯、重疊、狀態與 quota 驗證。 | ✅ | 2026-10-05 |
| TASK-002 | 在 `src/engine.ts` 對 `office.*` 導向行政 handler，明確 `office.enable`；仍採 clone、version、history、validateWorld 原子提交。新增只讀 report.administration，沒有修改錢包與流水。 | ✅ | 2026-10-05 |
| TASK-003 | 在 `src/templates.ts`／`templates/catalog.json` 宣告八模組與 general v2；`web/BuildCenter.tsx` 提供行政勾選，CLI 保留舊設定與相依檢查。 | ✅ | 2026-10-05 |

### Implementation Phase 2

- **GOAL-002**: 完成可操作行政工作台與可追溯 UI。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | 新增 `web/AdministrationDesk.tsx`、`administration.css`、client model；八分頁、7 日班表、表單、搜尋、狀態與資料不足原因，使用現有 onCommand 流程。 | ✅ | 2026-10-05 |
| TASK-005 | 在 `web/main.tsx` 加入 sidebar 與 `#administration`，既有工作區可明確啟用；`web/api.ts` 型別及 `web/icons.tsx` 加入行政資料與原創圖示。 | ✅ | 2026-10-05 |
| TASK-006 | 更新 README／操作文件與企業藍圖入口，標明行政試用與完整企業設計的不同範圍，不把假員工名冊稱為正式人資。 | ✅ | 2026-10-05 |

### Implementation Phase 3

- **GOAL-003**: 驗證、提交、公開更新與原資料保留。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-007 | 執行 domain／實際 Miniflare API／瀏覽器流程，驗證引用、狀態、複製原子性、隔離、匯出匯入、pending、手機、既有資料及 SIM 財務不變。 | ✅ | 2026-10-05 |
| TASK-008 | 型別、建置、Worker dry-run、完整回歸與打包；推送 mars-tw 個人 repo，沿用公開站 namespace，核對部署內容與工作區 hash，確認 CI。 | ✅ | 2026-10-05 |

## 3. Alternatives

- **ALT-001**: 直接把新 UI 當十七個企業模組已完成。未採用；這輪只提供明確邊界的行政模擬，沒有補齊完整多人身份與正式制度。
- **ALT-002**: 用瀏覽器 localStorage 保存業務。未採用；資料用原訪客 DO，受同一版本與收據流程保護。
- **ALT-003**: 改變每個舊產業範本的預設模組。未採用；其他七個產業保持舊預設，既有工作區明確啟用。

## 4. Dependencies

- **DEP-001**: 現有 Hono Worker／SQLite DO、React／Vite、Node／Playwright 及 schemaVersion 1 模擬資料；依鎖定版本，不增加套件。
- **DEP-002**: TASK-004 依賴 TASK-001 的固定 payload；TASK-007 依賴 TASK-001 至 TASK-006，瀏覽器前先 build。
- **DEP-003**: 完整企業系統的原 P0–P6 設計繼續有效，行政試用不解鎖正式金融、核准或政府接口。

## 5. Files

- **FILE-001**: `src/administration.ts`、`src/engine.ts`、`src/templates.ts`、`templates/catalog.json`。
- **FILE-002**: `web/AdministrationDesk.tsx`、`web/administration.css`、`web/administration-model.ts`、`web/main.tsx`、`web/api.ts`、`web/icons.tsx`、`web/BuildCenter.tsx`。
- **FILE-003**: `tests/administration.test.ts`、`tests/administration-api.test.ts`、`tests/e2e/administration.spec.ts`及受新範本契約影響的原案例。
- **FILE-004**: README、`docs/administration.md`、企業設計總覽與藍圖、部署驗收及本計畫。

## 6. Testing

- **TEST-001**: 行政未知鍵／prototype／金融欄位、錯誤日期、分鐘、金額、同人／設備重疊、跨集合 ID、跨訪客引用、非法狀態與 quota 拒絕。
- **TEST-002**: 啟用前後原業務與 generation 相同、只有版本／歷史增加；重送回執不重建行政資料，清除與重啟不復活舊 generation。
- **TEST-003**: 週複製失敗沒有部分班次，手動出勤不從班表假造；申請整理不扣幣、不核准假額或發薪。
- **TEST-004**: 實際新增／修改／狀態／搜尋／取消／重載、原 pending 恢復、320 px 深色精簡及 keyboard dialog。
- **TEST-005**: 原七模組、八產業、教學、搜尋、釘選、CLI 與公開資產回歸；所有新增功能只以合成資料測試。

## 7. Risks & Assumptions

- **RISK-001**: 一般企業新預設為 v2 八模組，舊 CLI default 重啟可能與舊 manifest 不符；下載設定 JSON 可繼續用原 modules，舊資料不覆寫。
- **RISK-002**: 行政紀錄增加後可能超過原匯入／history／quota；明列限制，不放寬資料完整性或偽稱可無限保存。
- **ASSUMPTION-001**: 使用者選台灣小型店家／中小企業，仍以假商品與 SIM 測試，未授權真人資料、正式企業共享或實際交易。

## 8. Related Specifications / Further Reading

- [行政操作與限制](../docs/administration.md)
- [完整企業規格](../spec/spec-design-enterprise-suite.md)
- [完整 P0–P6 計畫](design-enterprise-suite-v1.md)
- [人資與排班設計](../docs/enterprise/workforce-design.md)
- [財務與稅務設計](../docs/enterprise/finance-design.md)
