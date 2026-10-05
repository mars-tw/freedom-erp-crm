---
goal: 建立八套可預覽、套用與保存的整站設計模板
version: 1.0
date_created: 2026-10-05
last_updated: 2026-10-05
owner: mars-tw
status: In progress
tags: [design, templates, interface, responsive, simulation]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In_progress-yellow)

對象是使用八種 SIM 產業範本的店家、工廠與辦公室。這輪讓使用者挑選符合自己的視覺風格，模板改變導覽結構、字體、卡片、留白與配色；原交易、行政、教學及資料規則保留。先比較三種外框，再設計八個有獨立角色的模板，避免八張同版面縮圖只換顏色。

## 1. Requirements & Constraints

- **REQ-001**: 提供 harbor、executive、atelier、commerce、industrial、verdant、editorial、midnight 八套原創模板，各有淺色、深色與精簡密度相容，至少浮層、側欄、上方導覽三種結構。
- **REQ-002**: `#design` 於空白或既有工作區可使用；圖庫有分類、字面搜尋、空結果重設、目前套用標示、八種準確縮圖及精選預覽。
- **REQ-003**: 試看立即改畫面且不保存；明確前往工作台可保留試看，取消回原模板，套用才保存，其他一般導覽取消試看。試看期間業務寫入禁用。
- **REQ-004**: `freedom-erp.design.v1` 只接受 `{version:1,template:id}`，未知、額外、過大或損壞內容退回 harbor；儲存拒絕時維持此分頁記憶體並說明保存狀態。
- **SEC-001**: 模板、搜尋、試看與套用不得送出業務 POST，不存公司／客戶／金額，不改訪客隔離、CSRF、版本或交易收據。
- **CON-001**: 保留既有 `freedom-erp.interface.v1` 顯示模式／密度與釘選，不增加遠端字型、圖片、依賴或第三方介面資產。
- **GUD-001**: 320 px 無橫向溢出、44 px 操作、可見鍵盤焦點、尊重減少動態；預覽取消／套用後焦點可續用，八套行政列印均為白底並保留來源。

## 2. Implementation Steps

### Implementation Phase 1

- **GOAL-001**: 建立並審查視覺方向與模板契約。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-001 | `web/design-templates.ts` 建立八套 catalog、分類與 layout，嚴格 readDesignPreference／writeDesignPreference，偏好只保存模板識別。 | Yes | 2026-10-05 |
| TASK-002 | `web/design-templates.css` 實作三種外框與八種 heading、card、surface、nav signature，補全教學、建置、行政、表單、報表與列印；深色按鈕使用獨立 on-accent 字色。 | Yes | 2026-10-05 |
| TASK-003 | `web/DesignStudio.tsx`、`web/design-studio.css` 建立圖庫、準確縮圖、搜尋分類、空結果、試看／套用與跨頁 DesignPreviewBar。 | Yes | 2026-10-05 |

### Implementation Phase 2

- **GOAL-002**: 整合可操作的預覽與保存。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-004 | `web/main.tsx` 加入 design 導覽、啟動前同步 data-design、獨立 applied／preview 狀態、有效保存、取消及焦點；保護試看期間寫入，外觀設定加入圖庫入口。 | Yes | 2026-10-05 |
| TASK-005 | `web/index.html` 預設 harbor，`web/icons.tsx` 增加原創 design 圖示；新 CSS 在既有樣式後載入，保留原模式契約。 | Yes | 2026-10-05 |

### Implementation Phase 3

- **GOAL-003**: 完成逐套驗收、發布與說明。

| Task | Description | Completed | Date |
|------|-------------|-----------|------|
| TASK-006 | `tests/design-templates.test.ts` 驗證目錄、非法偏好及拒絕保存；`tests/e2e/design-templates.spec.ts` 驗證八套、試看取消／保存、零寫入、淺深色、320 px、焦點與列印。 | Yes | 2026-10-05 |
| TASK-007 | build 後擷取並實際看八套桌面／手機圖，執行原完整回歸、程式與 dry-run，修復對比／溢出／互動問題後凍結。 | Yes | 2026-10-05 |
| TASK-008 | 更新使用文件與驗收，推送 mars-tw 專案、驗證 CI、同 namespace 公開部署與原資料保存；實際公開完整回歸通過後記錄 Completed。 | | |

## 3. Alternatives

- **ALT-001**: 只增加配色按鈕。未採用，使用者明確要求不同設計模板，須有真正結構與排版差異。
- **ALT-002**: 引入外部後台主題套件與字型服務。未採用，保留原操作契約、原創授權與離線可用的字型 fallback。
- **ALT-003**: 模板直接寫進公司設定或備份。未採用，外觀是瀏覽器偏好，不能成為業務修改或跨訪客資料。

## 4. Dependencies

- **DEP-001**: 既有 React、Vite、Playwright、Windows／macOS／Linux 系統字型；不新增套件。
- **DEP-002**: TASK-003 與 TASK-004 依賴 catalog 契約；瀏覽器前必須完成 build，各輪使用獨立 output 目錄。
- **DEP-003**: 浮層是有界邊距與框線、陰影；三種結構如下，手機均退回可橫向捲動的模組列與單欄內容。

```text
浮層：[留白 [品牌／操作膠囊] 留白]
      [獨立導覽框] [有邊界的工作內容]
側欄：[品牌────────────────操作]
      [模組側欄] [標題／實際資料]
上方：[品牌────────────────操作]
      [模組列──────────────────]
      [標題／實際資料───────────]
```

視覺校讀後將品牌展示與工廠工程語言分開：atelier／editorial 用節制的襯線標題，industrial 用工程資料字型；harbor 以 #eef5f8 底色、#ffffff 表面、#102a43 文字、#24506b 導覽、#147b95 操作與 #acdded 層次形成浮層；其他完整角色值由版本化模板 CSS 定義。各角色字型都有本機繁中 fallback，資料數字使用等寬／tabular 顯示。每套只保留一項主要 signature，不加入無用途裝飾或假營收。

## 5. Files

- **FILE-001**: `web/design-templates.ts`、`web/design-templates.css`、`web/DesignStudio.tsx`、`web/design-studio.css`。
- **FILE-002**: `web/main.tsx`、`web/index.html`、`web/icons.tsx`。
- **FILE-003**: 新模板 unit／E2E、README、介面手冊、模板手冊、驗收紀錄與本計畫。

## 6. Testing

- **TEST-001**: 八個唯一識別、layout 分布、嚴格持久化、額外欄位／prototype 值拒絕、讀寫失敗及舊 interface 狀態保留。
- **TEST-002**: 試看取消不保存、套用重整保留、跨頁試看／其他導航取消、無工作區可看圖庫、分類搜尋及鍵盤焦點。
- **TEST-003**: 八套零業務 POST、workspace 內容／版本不變，八套淺深色及 320 px 無溢出，語義提示與按鈕可讀，行政報表列印白底及來源正確。
- **TEST-004**: 原八產業、店務、行政、備份、教學、資料隔離與原操作恢復完整回歸，原 namespace 保存及公開資產位元組一致。

## 7. Risks & Assumptions

- **RISK-001**: 舊 CSS 有固定顏色及特定 selector；模板需完整覆蓋已顯示的模組、按鈕、提示與深色對比。
- **RISK-002**: 上方／浮層導覽可能受長名稱與手機限制，須實際查 scrollWidth、焦點與真操作。
- **ASSUMPTION-001**: 八套為可擴充的原創外觀目錄，沒有將八種視覺風格當作新的產業功能或正式企業能力。

## 8. Related Specifications / Further Reading

- [介面操作](../docs/interface.md)
- [SIM 完整流程](feature-complete-sim-workflows-v1.md)
- [部署與驗收](../docs/verification.md)
