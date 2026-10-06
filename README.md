# Freedom ERP CRM

`mars-tw` 的 MIT 開源產業範本工作台。一個指令建立自己的模擬店家、工廠或專案公司；公開試用的每位訪客使用獨立工作區。

**[直接開啟公開試用](https://freedom-erp-crm-demo.digimkt.workers.dev/)** · [部署與驗收](docs/verification.md)

**[新手引導建置](https://freedom-erp-crm-demo.digimkt.workers.dev/#build)**：新訪客進站就會看到三步建置。填店名與行業，確認已選好的常用功能，再按「建立我的系統」；完成後直接進入自己的工作台。也可下載一鍵啟動包。Windows 解壓後雙擊 `start.cmd`；macOS／Linux 在解壓資料夾執行 `sh start.sh`。本機先安裝 Node.js 24 與 Git，首次啟動需要網路；不必手改設定，也不會覆寫原公開工作區。詳見[一鍵建置與接續使用](docs/quickstart.md)。

工作台提供「查看我的商品／服務」、「帶我做一次」與備份入口，可直接操作；進度依真實模擬紀錄更新。需要完整練習時，再選「帶我做一次」或「沉浸教學」。動態流程板會帶你實作商品銷售、服務交付或製造工單；支援原章節與答案接續、逐步讀值回看、本輪／工作區切換、精簡畫面及手機固定操作列。詳見[教學操作與限制](docs/learning.md)。

**[功能地圖](https://freedom-erp-crm-demo.digimkt.workers.dev/#capabilities)**：對照 Business Central／NAV、NetSuite 與 Odoo 19，整理 34 個主要工作領域，分別顯示已可用（SIM）、部分可用與待建置。每張卡列出可做的事、缺口與所需模組；可用子流程直達操作畫面，待建能力只連建置藍圖。官方來源、完整差距與後續驗收見[ERP 能力對照](docs/erp-reference-map.md)。這是原創實作與公開功能研究，沒有移入三家產品的程式或連接它們的帳號。

工作總覽新增店長／負責人、業務與服務、庫存與製造、行政與排班四種工作視角。待辦筆數取自目前資料，可直接定位到相關紀錄；流程入口按工作順序排列。視角只是瀏覽器偏好，沒有新增多人登入或權限。

日常工作台提供全站搜尋、清單篩選與分頁、待處理工作及操作條件提示；教學可直接定位到對應紀錄。任務與里程碑支援到期時間，詳見[日常操作](docs/workbench.md)。

**[八套設計模板圖庫](https://freedom-erp-crm-demo.digimkt.workers.dev/#design)**：深海商務、典雅企業、品牌工作室、活力店務、工廠控制室、自然門市、編輯工作台與夜間科技。各有導覽、字體、卡片與留白設計，可先試看、取消或套用；淺色／深色／系統配色與資訊密度獨立保留。詳見[模板操作](docs/design-templates.md)；快速建立、紀錄釘選與待處理分類見[外觀與快捷操作](docs/interface.md)。

完整企業管理、排班、人資、薪資結構、模擬資金對帳、會計、稅務與發票已整理成[企業擴充設計](docs/enterprise/README.md)及[可點選功能藍圖](https://freedom-erp-crm-demo.digimkt.workers.dev/enterprise-plan.html)。企業版新增十七個模組目前均為規劃，尚未加入資料引擎；藍圖提供規模切換、用途、操作流程與分期安排。

**[行政工作台](https://freedom-erp-crm-demo.digimkt.workers.dev/#administration)**：第八個 `administration` 模組可儲存組織、假員工、週班表、手動出勤、請假／請購／費用申請、設備借用與公告。班次、出勤與預約可附理由更正並查看原值；出勤可作廢，公告可封存及還原。空白行政桌可加入店家、辦公室或工廠的完整合成示範，清單可依目前篩選匯出 SIM CSV 或列印。一般企業 v2 預設加入，舊工作區可明確啟用而保留原資料；[操作方式與限制](docs/administration.md)。這是單訪客行政模擬，完整企業多人身份、正式人資、薪資及財務仍在規劃。

所有商品與金額都是模擬資料，幣別固定 `SIM`。沒有銀行、支付商、正式會計、電子發票或物流連線。這是流程練習與可擴充的起點，不能直接當成正式營運 ERP 或產業合規系統。

## 一個指令建立

先安裝 Node.js 24 與 Git，然後在 PowerShell 或終端機執行：

```sh
npx --yes github:mars-tw/freedom-erp-crm --industry retail --name '我的測試商店'
```

製造工廠：

```sh
npx --yes github:mars-tw/freedom-erp-crm --industry manufacturing --name '我的測試工廠' --port 8990
```

指令會建立獨立設定與 SQLite 儲存目錄，開啟本機 Worker。預設使用 `http://127.0.0.1:8788`；若埠已占用，請選 `--port` 及新的 `--directory`。關閉後用相同指令重啟，資料保留。第一次 GitHub 安裝會下載依賴並建置介面。

建置精靈下載的設定檔可用同一指令啟動，連接埠自動選擇，第一次進入會帶入指定的公司與模組並開啟工作台：

```sh
npx --yes github:mars-tw/freedom-erp-crm --config ./freedom-launch.json --open
```

```sh
npx --yes github:mars-tw/freedom-erp-crm --industry projects --name '專案工作室' --directory './my-projects' --port 8991
```

用 `--dry-run` 只建立設定，不啟動；`--help` 列出參數。不同企業請用不同目錄，既有不同設定不會被覆寫。自架模式不自動清除資料；資料仍屬模擬，請定期匯出 JSON。

## 八個範本

| `--industry` | 範本 | 已實作的練習 |
| --- | --- | --- |
| `retail` | 零售商店 | SKU、進貨、庫存、顧客、銷售與退貨 |
| `wholesale` | 批發商 | 箱裝商品、經銷客戶、出貨與 FIFO |
| `service` | 服務工作室 | 客戶、商機、報價、交付、補件、驗收 |
| `restaurant` | 餐飲店 | 食材、配方 BOM、餐點製作與銷售；沒有食安功能 |
| `manufacturing` | 製造工廠 | 原料、BOM 版本、工單、備料、完工成本轉移 |
| `ecommerce` | 電商 | 品牌商品、顧客、分次付款、分批出貨；沒有物流串接 |
| `projects` | 專案公司 | 案件、待辦、里程碑、報價與交付；沒有工時薪資 |
| `general` | 一般企業 | 探索全部已實作模組，作為客製起點 |

這八個範本不是「所有產業均已驗證」。新增產業請看[擴充範本](docs/templates.md)。

## 功能與資料

- CRM：客戶、聯絡人、商機、跟進、案件、失單原因、報價版本。
- 商品：採購入庫、FIFO 成本層、預留庫存、改價不改舊訂單。
- 訂單：多品項、分次模擬付款、付清後分批出貨、取消、部分退貨退款。
- 服務：模擬確認、交付版本、補件、最新版本驗收及測試幣付款。
- 製造：BOM、工單、備料、開工、完工；材料成本轉成成品，整數餘數保留。
- 專案：待辦與里程碑；模擬報表、錢包守恆與 JSON 匯出／匯入。
- 行政：組織、假員工、排班／出勤、申請、設備借用及公告；更正、作廢、封存與保留紀錄。

100 最小單位等於 1 SIM。公開試用沒有共享管理員帳號，資料於 72 小時沒有活動後清除；瀏覽器清除 cookie 後會進入另一個工作區。公開試用請只填虛構資料。

在「設定與資料」匯出或還原 SIM JSON。原選檔最多 8 MiB；解析後的精簡 UTF-8 JSON 最多 3 MiB，大備份採 24,000-byte 分段，每個請求本文仍不超過 32,768 bytes。完整內容、格式、引用與既有工作區容量檢查通過後，才一次取代資料；未完成傳輸可取消，或在開始後 15 分鐘內重選相同內容接續。詳見[備份、還原與結果恢復](docs/backups.md)。清除／切換範本前請先匯出。

## 開發及自行部署

```sh
git clone https://github.com/mars-tw/freedom-erp-crm.git
cd freedom-erp-crm
npm ci
npm run build
npm run dev
```

```sh
npm run typecheck
npm test
npm run test:e2e
npm run worker:dry-run
```

Cloudflare 的部署與資料隔離見[部署說明](docs/deployment.md)。公開入口由此 README 的[部署驗收](docs/verification.md)記錄；本專案不自動修改自由工坊正式資料庫。

## 授權與協作

[MIT License](LICENSE)｜[第三方 NOTICE](NOTICE)｜[依賴授權原文](docs/licenses/)｜[CONTRIBUTING](CONTRIBUTING.md)

本專案使用為使用者新撰寫的模擬領域程式與原創介面，不重新授權整個 `freedom-platform`，也不搬入其會員資料、登入程式或品牌圖像。自由工坊的社群入口整合透過單獨 PR 審查。
