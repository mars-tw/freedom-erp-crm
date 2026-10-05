# Freedom ERP CRM

`mars-tw` 的 MIT 開源產業範本工作台。一個指令建立自己的模擬店家、工廠或專案公司；公開試用的每位訪客使用獨立工作區。

**[直接開啟公開試用](https://freedom-erp-crm-demo.digimkt.workers.dev/)** · [部署與驗收](docs/verification.md)

**[快速上手建置精靈](https://freedom-erp-crm-demo.digimkt.workers.dev/#build)**：選產業、取名稱與勾選功能，再直接試用或下載一鍵啟動包。Windows 解壓後雙擊 `start.cmd`；macOS／Linux 在解壓資料夾執行 `sh start.sh`。本機先安裝 Node.js 24 與 Git，首次啟動需要網路；不必手改設定，也不會覆寫原公開工作區。詳見[一鍵建置與接續使用](docs/quickstart.md)。

建立工作區後，按「開始流程教學」。動態流程板會帶你實作商品銷售、服務交付或製造工單；支援原章節與答案接續、逐步讀值回看、本輪／工作區切換、精簡畫面及手機固定操作列。詳見[教學操作與限制](docs/learning.md)。

日常工作台提供全站搜尋、清單篩選與分頁、待處理工作及操作條件提示；教學可直接定位到對應紀錄。任務與里程碑支援到期時間，詳見[日常操作](docs/workbench.md)。

外觀可切換暖紙、深色或系統配色，並調整資訊密度；新增快速建立、紀錄釘選與待處理分類，詳見[外觀與快捷操作](docs/interface.md)。

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

建置精靈下載的設定檔可用同一指令啟動，連接埠自動選擇，第一次進入會帶入指定的公司與模組並開啟教學：

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

100 最小單位等於 1 SIM。公開試用沒有共享管理員帳號，資料於 72 小時沒有活動後清除；瀏覽器清除 cookie 後會進入另一個工作區。公開試用請只填虛構資料。

匯入封裝上限 32 KB，含格式與引用檢查。較大的工作區可以匯出保存，不能宣稱可透過目前的匯入上限還原。清除／切換範本會刪除該訪客工作區，請先匯出。

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
