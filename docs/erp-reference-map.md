# 新手 ERP 能力對照與原創介面設計

查核日期：2026-10-06。研究對象：Microsoft Dynamics 365 Business Central、Oracle NetSuite、Odoo 19.0。功能現況依本次研究開始時的 `src/engine.ts`、`src/domain.ts`、`src/administration.ts`、`web/workbench-model.ts` 與既有文件判定；開發中的新版介面須完成測試後才可更新狀態。

使用者提到的 NAV 系列，本輪以 Business Central 現行官方文件為研究對象。Microsoft 的改名說明將 Dynamics NAV 與 Business Central on-premises 接續；本文件沒有把舊 NAV 版本與現行雲端版的細項視為完全相同。[S-41]

這份文件把商務能力與新手操作方式拆開比較。官方來源用來確認各產品公開說明的能力；本專案的介面、文字、資料契約與程式由本專案自行設計。沒有移入三家產品的程式、畫面、商標圖像或授權檔，也沒有把 Odoo 社群／企業版功能一概認定為可納入 MIT 專案。

Business Central 的能力分類與角色首頁，適合用來整理「今天要做的工作」；NetSuite 的角色儀表板與分階段導入，適合縮小第一次使用的功能範圍；Odoo 19 的 App 分組與模組相依提示，適合說明每個功能做什麼，以及啟用後會影響哪些流程。這些是本專案的設計判斷，並非官方保證本專案能達到相同功能或效益。[S-01][S-02][S-04][S-14][S-22][S-23]

## 狀態與來源怎麼讀

- `ready`：下表寫明的窄範圍 SIM 流程已有引擎與操作畫面；不表示與商業 ERP 功能相當，也不表示正式營運可用。
- `partial`：已有相關資料或操作，但缺少該能力的關鍵環節。卡片要同時呈現可做與缺少的部分。
- `planned`：目前沒有該能力的完整資料引擎；既有企業藍圖只能提供設計，不可顯示成可執行功能。
- 「未查核」：本輪未取得足以支持該產品細項的官方資料，不代表產品不支援。

能力狀態與工作區模組是否啟用是兩個欄位。已實作但未啟用的模組應提示「目前工作區未啟用」；不能把它改標為「尚未實作」。官方來源的 `S-` 代號都連到支持該欄主題的頁面。Odoo 資料限定 `19.0`；部分 HTML 頁在查核時逾時，改讀 Odoo 官方文件儲存庫 `19.0` 分支的同名來源，未改用其他版本。

## 34 項能力對照

官方欄只摘要已核實的主題。每列的現況與差距來自本專案程式；最後一欄是本專案的原創設計建議。

| 能力 ID | 能力與本專案狀態 | Business Central 官方參考 | NetSuite 官方參考 | Odoo 19 官方參考 | 現有資料與缺口；適合新手的操作方式 |
| --- | --- | --- | --- | --- | --- |
| CAP01 | 引導建立工作區 · `partial` | 公司設定、引導設定。[S-04] | 依產業分階段導入。[S-14] | App 選擇與依賴。[S-23] | 已有八範本、名稱、模組與本機包；首訪入口正在改善。只問名稱、行業、推薦功能，預覽後一次明確確認；不建立交易。 |
| CAP02 | 日常角色視角 · `partial` | 依角色安排首頁資料與動作。[S-02] | 角色儀表板。[S-14][S-15] | App 導覽；身份權限另有設定。[S-23][S-37] | 已有工作總覽；缺少店長、業務、庫存製造、行政視角。視角只整理入口，不能稱為登入身份或權限。 |
| CAP03 | 搜尋與就地教學 · `partial` | 搜尋頁面、動作、資料、說明。[S-03] | 全站搜尋與欄位／說明中心。[S-16][S-17] | 依 App 的文件與設定入口。[S-22][S-23] | 已有 Ctrl K 紀錄搜尋、篩選及沉浸教學；缺少能力搜尋。增加「我要做什麼」索引與同義詞，結果直接開現有畫面。 |
| CAP04 | 可操作儀表板 · `partial` | 資料摘要、活動與快捷動作。[S-02] | KPI、提醒、任務及明細追查。[S-15][S-21] | App 首頁與銀行卡片。[S-23][S-29] | 已有待辦、缺料、缺測試幣提示與紀錄定位；缺少角色排序。每個提醒列原因、筆數、下一動作，點擊不代做交易。 |
| CAP05 | 科目、總帳、期間結帳 · `planned` | 科目、總帳、期間與財報。[S-05] | GL、分錄與結帳。[S-18] | 雙式簿記、科目與財報。[S-24] | SIM 錢包兩腿守恆沒有會計科目或傳票，不能算 GL。未來另建 SIM 傳票與期間政策；現在連到財務藍圖。 |
| CAP06 | 應收與收款分攤 · `partial` | 應收、收款及未清餘額。[S-05] | 帳款、付款條件與收款分攤。[S-19] | 客戶發票、付款、AR 報表。[S-24] | 訂單／服務可分次收 SIM；沒有應收帳簿、到期帳齡或跨文件分攤。現階段只稱「待收測試幣」。 |
| CAP07 | 應付與供應商帳款 · `planned` | 應付與付款。[S-05][S-06] | 供應商帳單審查與付款。[S-20] | 供應商帳單與 AP。[S-24] | 入庫目前即時扣 SIM，沒有 PO、帳單或 AP。未來把請購、收貨、帳單、付款分開；禁止用入庫紀錄充當未清帳款。 |
| CAP08 | 銀行、資金與對帳 · `planned` | 銀行核對與資金分析。[S-05] | 銀行資料與匹配。[S-18] | 銀行日記帳及對帳。[S-24][S-29] | 沒有銀行匯入或對帳。未來只先支援明示格式的合成 CSV、預覽、差異與人工確認；不連真銀行。 |
| CAP09 | 稅務與發票生命週期 · `planned` | VAT 計算與區域規則。[S-05] | 稅引擎與稅務報表。[S-25] | 稅、發票與在地化。[S-24] | 沒有稅額引擎、台灣電子發票或申報。未來保留政策版次、草稿／作廢／折讓等模擬狀態；不產生正式字軌或送件檔。 |
| CAP10 | 固定資產與設備 · `planned` | 固定資產領域。[S-01] | 資產生命週期與折舊。[S-26] | 資產與會計報表。[S-24] | 行政設備可借還；沒有取得成本、折舊、處分或租賃會計。入口分清「設備借用」與未建的「固定資產帳」。 |
| CAP11 | 客戶、聯絡人、商機 · `ready` | 關係管理領域。[S-01] | CRM 與銷售自動化。[S-13] | 線索、商機、後續活動。[S-25A] | 已有 SIM 客戶、聯絡人、商機、跟進與失單原因。提供客戶概況與下一次跟進；不聲稱已有行銷郵件或自動聯繫。 |
| CAP12 | 報價版本與產品配置 · `partial` | 銷售報價。[S-01] | CPQ 分類。[S-13] | 報價到訂單。[S-26A] | 已有報價版本、凍結摘要與模擬確認；沒有規格配置、價目表規則或 CPQ。把目前報價明確定位為案件的模擬報價。 |
| CAP13 | 客服與問題案件 · `partial` | 服務管理。[S-11] | 客服案件管理。[S-13] | Helpdesk 分類。[S-22] | 已有一般 CRM 案件；沒有客服 SLA、工單分派或入口表單。先顯示案件進度與待跟進；完整客服另設計。 |
| CAP14 | 訂單、付款、出貨與退貨 · `ready` | 銷售與退貨領域。[S-01] | 訂單管理。[S-13] | 銷售與交付。[S-26A] | 已有多品項、分次 SIM 付款、付清後分批出貨及退貨退款。用一張訂單流程卡解釋剩餘付款／出貨量，保留原確認表單。 |
| CAP15 | 店家 POS 與餐飲點單 · `planned` | 本輪未查核 POS 細項。 | 多通路與 POS 串接分類。[S-13] | POS、餐桌、廚房及分帳。[S-27] | 餐飲／零售範本可模擬接單；沒有桌號、即時收銀、廚房單、離線 POS 或刷卡。只能連現有訂單，不把範本改名為 POS。 |
| CAP16 | 請購、採購與驗收 · `partial` | 採購單、部分收貨與退貨。[S-06] | 採購與帳單核對。[S-20] | RFQ、PO 及收貨。[S-30] | 有請購行政草稿與 SIM 採購入庫；沒有供應商卡、PO 或三方核對。入口先提示「目前入庫即付 SIM」與採購藍圖。 |
| CAP17 | 商品、庫存與 FIFO · `ready` | 庫存成本。[S-07] | 庫存管理分類。[S-13] | 庫存與估價。[S-24][S-28] | 已有共用庫存、預留、成本層、FIFO 退貨回補；沒有單位換算或正式存貨分錄。現有量、預留量、可用量分開呈現。 |
| CAP18 | 倉庫、儲位與移轉 · `planned` | 收貨、揀貨與倉儲配置。[S-08] | 倉儲與履約分類。[S-13] | 倉庫、儲位與路線。[S-31] | 庫存仍共用；行政分店不是儲位。未來設庫存所在位置與移轉紀錄；現在只顯示缺口，不能提供假移倉按鈕。 |
| CAP19 | BOM、製造工單與材料成本 · `ready` | BOM、工序、容量與工單。[S-09] | 製造領域。[S-14] | BOM 與製造訂單。[S-32] | 已有版本化 BOM、工單快照、備料、開工、完工材料成本轉移；沒有工序／產能／人工成本。顯示本單材料缺口與下一階段。 |
| CAP20 | 需求、補貨與生產計畫 · `planned` | 生產規劃領域。[S-01][S-09] | 需求預測與補貨建議。[S-27A] | 補貨、製造排程。[S-28][S-32] | 沒有 MRP、交期或預測。可先做唯讀缺料提示；未來需求建議必須標示假設，採購／工單仍由使用者確認建立。 |
| CAP21 | 服務交付與現場派工 · `partial` | 服務叫修、訂單與零件。[S-11] | 現場派工與服務分類。[S-13] | 現場任務、路線、工作表。[S-33] | 已有服務交付版本、補件、驗收與 SIM 收款；沒有路線、技師派工或耗材清單。將「交付驗收」與「現場派工待建」分開。 |
| CAP22 | 專案、資源、工時與成本 · `partial` | 專案、資源、預算及工時。[S-10] | PSA、工時與專案預算。[S-13] | 任務與專案獲利。[S-34] | 有案件、任務、到期日與里程碑；沒有專案工時、預算、資源容量或損益。先列到期與下一件待辦，不把訂單毛利稱專案利潤。 |
| CAP23 | 人資與到離職 · `partial` | 員工及缺勤領域。[S-12] | HR 與績效分類。[S-13] | 員工、部門、到離職。[S-35] | 有組織與假員工代碼／別名；沒有正式人事檔案、合約、招募或異動制度。新手先建合成組織與角色名稱。 |
| CAP24 | 排班與手動出勤 · `partial` | 人資缺勤領域。[S-12] | 排班與工時分類。[S-13] | 班次、資源與規劃。[S-36] | 已有單訪客班表、重疊檢核、複製週、更正與手動出勤。計畫班次與實際出勤保持分開；不宣稱勞動合規或真實打卡。 |
| CAP25 | 薪資結構與薪資單 · `planned` | 薪資交易匯入 GL。[S-05] | Payroll 分類。[S-13] | 薪資結構、工作紀錄與在地化。[S-38] | 沒有薪資計算或薪轉。未來用假員工與 SIM 薪項，清楚列應付、扣項、實付及雇主負擔；不套用未驗證法定規則。 |
| CAP26 | 行政、費用與簽核 · `partial` | 工作流及核准。[S-12A] | 多階段工作流。[S-28A] | 費用提交、核准與報銷。[S-39] | 有申請送出、退回、撤回及待覆核整理；沒有另一位驗證簽核者或費用入帳。準備完成維持 `prepared_unreviewed`，不可改稱已核准。 |
| CAP27 | 模擬備份與操作追溯 · `ready` | 外部資料與文件領域。[S-01] | 資料管理分類。[S-13] | 匯入／匯出分類。[S-22] | 有驗證式 SIM JSON 備份、分段還原及歷史；非企業文件庫或不可竄改審計。主動提示備份、來源世代與工作區版本。 |
| CAP28 | 分析、預算與經營報表 · `partial` | 財務分析與預算。[S-05] | 儀表板、報表與明細追查。[S-21] | 報表、分析帳與預算。[S-24] | 有 SIM 出貨、FIFO 成本、毛利及庫存價值；沒有全成本損益或預算引擎。每張數據卡可看口徑與原資料，不混稱收入或淨利。 |
| CAP29 | 條件提醒與流程自動化 · `planned` | 工作流。[S-12A] | 事件、排程與通知。[S-28A] | Automation rules 分類。[S-22] | 有讀值式就緒檢核與待辦排序；沒有通用自動流程。先把「提醒我」做好；未來自動寫入需另設契約、冪等與可追溯紀錄。 |
| CAP30 | 企業身份、權限與整合 · `planned` | 管理與資料交換領域。[S-01] | 角色權限與標準整合。[S-29A][S-30A] | 使用者／群組存取權限。[S-37] | 有匿名訪客隔離、CSRF、版本與冪等，但沒有企業多人登入或權限；沒有外部 connector。角色視角不得解鎖資料或虛構授權。 |
| CAP31 | 網站、電商與通路資料 · `planned` | 本輪未查核電商細項。 | Commerce 與連接器分類。[S-13] | 商品到結帳的電商領域。[S-40] | 有電商產業範本，沒有公開商品網站、購物車或商店串接。入口只開模擬訂單；電商上線另作獨立設計。 |
| CAP32 | 批號、序號、條碼與效期 · `planned` | 本輪未查核追蹤細項。 | 本輪未查核追蹤細項。 | 供應鏈中的批序號、條碼等主題。[S-28B] | 現有 FIFO 成本層不是供應批號；沒有可追溯批序號或掃碼。未來加獨立 schema，效期與庫存處置要有確切來源。 |
| CAP33 | 品質檢查與設備維護 · `planned` | 製造連結品質領域。[S-09] | 本輪未查核品質細項。 | 品質檢查、警示與維護入口。[S-32][S-32A] | 設備借用不等於維護，工單完成不代表品質檢查通過。未來建立檢查項、結果、異常與處置；不宣稱食品或產業認證。 |
| CAP34 | 日曆、預約與資源時段 · `partial` | 服務排程領域。[S-11] | 現場排程分類。[S-13] | 預約與資源規劃。[S-36][S-40A] | 班次與設備預約可檢查重疊，但沒有對外預約、自助訂位或日曆同步。現階段可直達行政設備借用與週班表。 |

## 這次最值得實作的介面

下列 P0 工作使用既有引擎，可改善新手操作且不引進新的金融資料；驗收前皆視為設計建議。

| 優先序 | 原創設計 | 可執行驗收 |
| --- | --- | --- |
| P0／CAP01 | 三步建置：店名與行業、推薦功能、預覽並建立。首頁直接進引導；老訪客回到原工作區。 | 新瀏覽器只做一次 setup POST；名稱空白或功能全關不得前進；8 範本和依賴一致；建置後進工作總覽，ledger、orders、workOrders 仍空白；重新整理保留世代與版本。 |
| P0／CAP02 | 讓使用者選「今天主要做哪種工作」，提供店長、業務、庫存製造、行政四視角；每個視角只保留少量常用入口。 | 四視角只讀已啟用模組；切換、重整及還原偏好不發 business POST、不改版本；未啟用模組不提供能執行的假入口；320px 可鍵盤操作。 |
| P0／CAP03 | 建立原創能力地圖：搜尋、類別、狀態、目前模組啟用情形、可做／缺口、下一動作。 | CAP ID 唯一且固定；`planned` 卡只能開設計說明；`partial` 顯示缺口；已可用模組按鈕開真畫面；字面搜尋 `.*[]` 不被當 regex；搜尋與篩選不寫業務資料。 |
| P0／CAP04 | 角色首頁共用真資料待辦，依視角排序；每筆提醒可定位到紀錄與阻擋原因。 | 筆數與 `workQueue()` 結果相同；缺料／欠款可追到正確商品／錢包；取消、完成、全部退貨不再列錯誤動作；點入待辦只導航，真正命令仍由原表單確認。 |
| P0／CAP27 | 建置成功顯示「下一件工作」與備份入口；引導進度由歷史事實判定，可收合／重開。 | 點開模組或教學不能標示工作已完成；進度隨真命令更新；依工作區世代保存收合設定；新世代不沿用舊狀態；拒絕儲存時仍可在目前分頁操作。 |
| P1／CAP06、17、19、28 | 在待辦與報表增添可讀解釋：「尚欠多少 SIM」「可用／預留量」「本工單材料成本」「毛利不含哪些費用」。 | 算式採既有最小單位／FIFO 引擎，不另推導浮點財務；數字與來源一致；缺資料顯示原因；不自行補幣、入庫、出貨、完工或傳送資料。 |

CAP20 的「唯讀補貨缺口清單」適合下一個小功能：從現有開放工單的凍結 BOM 與共享可用庫存算需求，先按商品彙總並顯示來源工單；必須避免把同一預留量在多單重複當可用。它是材料檢查工具，不是完整 MRP。CAP05、07、08、09、25 的財務／薪資引擎應另訂 schema、遷移與驗收，不能塞進這次導覽改善。

## SIM 與原創邊界

現在所有業務金額維持 `currency:SIM`、`simulation:true`、`real_finance:false`。沒有真銀行、支付、薪轉、正式會計、報稅、電子發票或物流連線。角色首頁只保存呈現偏好，沒有變更身份、存取權限或正式法人範圍。[本專案財務設計](enterprise/finance-design.md)、[行政工作台](administration.md)

不得將訂單付款稱為正式應收帳款，不得將即付入庫稱為應付帳簿，不得將兩腿錢包流水稱為 GL，也不得將 FIFO 模擬毛利稱為淨利。班表不等於出勤、出勤不等於核定薪資、設備借用不等於固定資產帳、行政整理完成不等於獨立簽核。

Odoo 19 文件中的模組相依、資料刪除、會計與權限說明是參考資料，沒有授權本專案自動安裝、解除安裝、接銀行、發信、刪除使用者資料或讀取秘密。三家產品的能力、在地化、版本、方案及整合資格也不能推導為本專案已符合台灣法令。

## 已查核的官方來源

每個來源的衍生內容均限制在短主題摘要；沒有逐字引用或產品畫面重製。來源清單不代表本專案與原廠有整合或合作。

[S-01]: https://learn.microsoft.com/en-us/dynamics365/business-central/across-business-functionality "S-01：Business Central business functionality"
[S-02]: https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/developer/devenv-designing-role-centers "S-02：Business Central role centers"
[S-03]: https://learn.microsoft.com/en-us/dynamics365/business-central/ui-search "S-03：Business Central search"
[S-04]: https://learn.microsoft.com/en-gb/dynamics365/business-central/setup "S-04：Business Central assisted setup"
[S-05]: https://learn.microsoft.com/en-us/dynamics365/business-central/finance "S-05：Business Central finance"
[S-06]: https://learn.microsoft.com/en-us/dynamics365/business-central/purchasing-manage-purchasing "S-06：Business Central purchasing"
[S-07]: https://learn.microsoft.com/en-ca/dynamics365/business-central/finance-manage-inventory-costs "S-07：Business Central inventory costs"
[S-08]: https://learn.microsoft.com/en-us/dynamics365/business-central/design-details-warehouse-management "S-08：Business Central warehouse management"
[S-09]: https://learn.microsoft.com/en-us/dynamics365/business-central/production-manage-manufacturing "S-09：Business Central manufacturing"
[S-10]: https://learn.microsoft.com/en-us/dynamics365/business-central/projects-manage-projects "S-10：Business Central projects"
[S-11]: https://learn.microsoft.com/en-us/dynamics365/business-central/service-service "S-11：Business Central service"
[S-12]: https://learn.microsoft.com/en-us/dynamics365/business-central/hr-manage-human-resources "S-12：Business Central HR"
[S-12A]: https://learn.microsoft.com/en-us/dynamics365/business-central/across-workflow "S-12A：Business Central workflows"
[S-13]: https://www.netsuite.com/portal/products.shtml "S-13：NetSuite official product menu"
[S-14]: https://www.netsuite.com/portal/products/suitesuccess.shtml "S-14：NetSuite SuiteSuccess"
[S-15]: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N578457.html "S-15：NetSuite dashboard personalization"
[S-16]: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4335483183.html "S-16：NetSuite record search"
[S-17]: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N336258.html "S-17：NetSuite help center"
[S-18]: https://www.netsuite.com/portal/products/erp/financial-management/finance-accounting/general-ledger-software.shtml "S-18：NetSuite general ledger"
[S-19]: https://www.netsuite.com/portal/products/erp/financial-management/finance-accounting/accounts-receivable-software.shtml "S-19：NetSuite accounts receivable"
[S-20]: https://www.netsuite.com/portal/products/erp/financial-management/finance-accounting/accounts-payable-software.shtml "S-20：NetSuite accounts payable"
[S-21]: https://www.netsuite.com/portal/products/business-intelligence.shtml "S-21：NetSuite SuiteAnalytics"
[S-22]: https://www.odoo.com/documentation/19.0/applications.html "S-22：Odoo 19.0 user docs"
[S-23]: https://www.odoo.com/documentation/19.0/applications/general/apps_modules.html "S-23：Odoo 19.0 apps and modules"
[S-24]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/finance/accounting.rst "S-24：Odoo official 19.0 accounting source"
[S-25]: https://www.netsuite.com/portal/products/erp/financial-management/finance-accounting/tax-management-software.shtml "S-25：NetSuite tax management"
[S-25A]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/sales/crm.rst "S-25A：Odoo official 19.0 CRM source"
[S-26]: https://www.netsuite.com/portal/products/erp/financial-management/finance-accounting/fixed-assets-management.shtml "S-26：NetSuite fixed assets"
[S-26A]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/sales/sales.rst "S-26A：Odoo official 19.0 sales source"
[S-27]: https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale.html "S-27：Odoo 19.0 POS"
[S-27A]: https://www.netsuite.com/portal/products/erp/demand-planning.shtml "S-27A：NetSuite demand planning"
[S-28]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/inventory_and_mrp/inventory.rst "S-28：Odoo official 19.0 inventory source"
[S-28A]: https://www.netsuite.com/portal/platform/developer/suiteflow.shtml "S-28A：NetSuite workflow"
[S-28B]: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp.html "S-28B：Odoo 19.0 supply chain"
[S-29]: https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank.html "S-29：Odoo 19.0 bank and cash"
[S-29A]: https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N285436.html "S-29A：NetSuite roles"
[S-30]: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/purchase/manage_deals/rfq.html "S-30：Odoo 19.0 RFQ and PO"
[S-30A]: https://www.netsuite.com/portal/platform/developer/suitetalk.shtml "S-30A：NetSuite integration"
[S-31]: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/warehouses_storage/inventory_management.html "S-31：Odoo 19.0 warehouses and locations"
[S-32]: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/manufacturing.html "S-32：Odoo 19.0 manufacturing"
[S-32A]: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/quality.html "S-32A：Odoo 19.0 quality"
[S-33]: https://www.odoo.com/documentation/19.0/applications/services/field_service.html "S-33：Odoo 19.0 field service"
[S-34]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/services/project.rst "S-34：Odoo official 19.0 project source"
[S-35]: https://www.odoo.com/documentation/19.0/applications/hr/employees.html "S-35：Odoo 19.0 employees"
[S-36]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/services/planning.rst "S-36：Odoo official 19.0 planning source"
[S-37]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/general/users/access_rights.rst "S-37：Odoo official 19.0 access rights source"
[S-38]: https://www.odoo.com/documentation/19.0/applications/hr/payroll.html "S-38：Odoo 19.0 payroll"
[S-39]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/finance/expenses.rst "S-39：Odoo official 19.0 expenses source"
[S-40]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/websites/ecommerce.rst "S-40：Odoo official 19.0 ecommerce source"
[S-40A]: https://raw.githubusercontent.com/odoo/documentation/19.0/content/applications/productivity/appointments.rst "S-40A：Odoo official 19.0 appointments source"
[S-41]: https://learn.microsoft.com/en-us/dynamics/s-e/365business/bconpremdownload_175 "S-41：Microsoft NAV rename to Business Central on-premises"
