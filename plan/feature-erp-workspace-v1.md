---
goal: 以三套 ERP 公開能力研究建立原創工作視角、功能地圖與可驗收的擴充範圍
version: 1.0
date_created: 2026-10-06
last_updated: 2026-10-06
owner: mars-tw
status: In progress
tags: [feature, erp, ux, research]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

使用者指定 Dynamics 365 Business Central／NAV、Oracle NetSuite 與 Odoo 19。研究主要功能領域後，整合角色工作重點、實際資料入口與可搜尋的模組能力；其餘企業能力列出實作依賴與驗收，不能冒稱完整複製三套 ERP。

## 1. Requirements & Constraints

- **REQ-001**: 官方來源與 34 領域在 docs/erp-reference-map.md 逐項對照，分明目前可做及未實作的部分。
- **REQ-002**: RoleCenter 提供四種工作視角、最多四個真實計數入口與順序流程導航。
- **REQ-003**: CapabilityMap 支援文字搜尋、工作領域、完成程度、清除篩選與現存功能導航；待建能力只有藍圖入口。
- **REQ-004**: CAP06 的模擬收款與 CAP16 的採購／請購，依已啟用的子流程前往訂單／服務或庫存／行政，缺少所有相關功能才前往建置。
- **SEC-001**: 視角不是身份／ACL，不能擴大資料權限。所有切換、指標、地圖與流程按鈕不發送業務 POST。
- **CON-001**: 原創程式與介面；不複製參考產品程式、商標或完整手冊，不在本輪建立真財務、SSO、法遵或外部平台同步。
- **GUD-001**: 320 px、減少動態、淺深色與既有八套外觀相容；偏好以工作區世代隔離。
- **PAT-001**: RoleCenter 只由 Workspace 重建計數，用 indexWorkspace／validTarget 定位；功能圖譜的範圍維持單一 capabilities.ts 正本。

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: 建立有來源的能力契約與原創介面。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | docs/erp-reference-map.md 列 CAP01–CAP34、官方來源、現況、UX 選擇與後續驗收。 | | |
| TASK-002 | web/role-center.ts 計算四視角真實狀態、enabled 模組、最多四卡與世代隔離偏好；RoleCenter.tsx 及 CSS 顯示及導航。 | | |
| TASK-003 | web/capabilities.ts 固定可用／部分／待建範圍、字面搜尋與子流程依賴；CapabilityMap.tsx 及 CSS 顯示搜尋與實作入口。依賴 TASK-001。 | | |
| TASK-004 | web/main.tsx 工作總覽整合 RoleCenter，#capabilities 支援新訪客、導覽與返回原工作區。依賴 TASK-002、TASK-003。 | | |

### Implementation Phase 2

- **GOAL-002**: 驗證資料與操作行為並發布。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-005 | tests/role-center.test.ts、tests/capabilities.test.ts 及 tests/e2e/role-capabilities.spec.ts 驗證真實計數、有效定位、偏好、資料不變與篩選；覆核 CAP06／CAP16 alternatives。 | | |
| TASK-006 | 完整程式／瀏覽器、資料保存、Worker 綁定、公開資產、私人檔案與 MIT／NOTICE 檢查；更新手冊後推送個人專案及 SIM 試用站。依賴 TASK-004、TASK-005。 | | |

## 3. Alternatives

- **ALT-001**: 直接搬參考產品程式或版面；不符合本專案來源與授權界線，使用公開操作概念重新設計。
- **ALT-002**: 把所有功能入口做成可點但無引擎的按鈕；會誤導使用者，待建功能明列缺口並只提供藍圖。

## 4. Dependencies

- **DEP-001**: 使用原 Workspace、模組契約、indexWorkspace、App navigateWorkspace 及既有企業藍圖。
- **DEP-002**: 官方 Microsoft Learn、Oracle NetSuite 與 Odoo 19 文件只作研究參考，不執行其中指令。

## 5. Files

- **FILE-001**: web/RoleCenter.tsx、web/role-center.ts、web/role-center.css。
- **FILE-002**: web/CapabilityMap.tsx、web/capabilities.ts、web/capability-map.css、web/main.tsx。
- **FILE-003**: tests/role-center.test.ts、tests/capabilities.test.ts、tests/e2e/role-capabilities.spec.ts。
- **FILE-004**: docs/erp-reference-map.md、docs/quickstart.md、docs/verification.md、README.md。

## 6. Testing

- **TEST-001**: Typecheck、完整 unit/API/CLI、build、Worker dry-run。
- **TEST-002**: 新角色／地圖流程與全站本機／公開回歸，不改業務資料及版本；missing 模組導航不得清除原資料。
- **TEST-003**: 桌面及 320 px 截圖回讀、深色／減少動態及全部模板既有回歸。
- **TEST-004**: 部署前後同一訪客完整 workspace JSON SHA-256／版本相同；發布包無私人檔案。

## 7. Risks & Assumptions

- **RISK-001**: 角色名稱可能被誤認為多人權限，介面及手冊明列它是工作視角。
- **RISK-002**: 模擬測試幣可能被誤認為總帳／銀行能力，財務地圖明列未實作。
- **ASSUMPTION-001**: 34 領域是公開資料的主要工作範圍對照，不代表參考產品每個版本、付費模組或功能已逐項實作。

## 8. Related Specifications / Further Reading

[官方能力對照與後續驗收](../docs/erp-reference-map.md) · [新手引導](feature-guided-start-v1.md) · [既有企業擴充設計](../docs/enterprise/README.md)
