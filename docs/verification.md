# 開源與公開試用驗收

2026-10-02。個人專案：[mars-tw/freedom-erp-crm](https://github.com/mars-tw/freedom-erp-crm)。

公開試用：[Freedom ERP CRM](https://freedom-erp-crm-demo.digimkt.workers.dev/)。Cloudflare Worker `freedom-erp-crm-demo`、SQLite Durable Object `BusinessWorkspace`、migration `v1` 已部署。健康檢查回 `simulation:true`、`real_finance:false`、`currency:SIM`；只使用新專案資源，沒有更新自由工坊正式資料庫或原站 Worker。

## 已實跑

| 驗證 | 結果 |
| --- | --- |
| 型別、Vite 建置、Worker dry-run | 通過 |
| 領域、公開 API 與 CLI | 20／20 通過，無略過 |
| 本機瀏覽器 | 14／14 通過 |
| 實際 HTTPS 公開站瀏覽器 | 14／14 通過；53.2 秒，無 flaky／略過 |
| 產業範本 | 八個範本實際建立、顯示設定及重新載入保存 |
| 製造流程 | 模擬補幣、材料入庫、備料、開工、完工及 FIFO 成本守恆 |
| 兩位訪客 | 獨立 cookie／Durable Object，資料及 CSRF 隔離 |
| 異常恢復 | 請求未送達後保留原內容、版本、代號，重新載入後只建立一筆 |
| 四尺寸 | 1440、768、390、320 px 的已填資料頁面無水平溢出，已查看畫面 |
| 指令實際啟動與重啟 | Node CLI 工廠範本、中文含空白店名、獨立儲存；停止並重啟後同 cookie 的資料 hash、版本及店名一致，無自動清除期限 |
| 發布包 | LICENSE、NOTICE、依賴授權原文、CLI、web／src／dist 包含；私人狀態、audit、環境檔及 node_modules 不在發布包 |

公開 API 檢查涵蓋 CSRF／Origin、過時版本、異內容重送、跨訪客收據、模組 gate、金融旗標／流水／付款／引用／庫存偽造匯入拒絕、真正 72 小時儲存 alarm 與原清除程式。CLI 包含八產業、模組相依、特殊店名、無效參數、精確重啟設定、已有資料拒絕覆寫及符號路徑拒絕。

最初實際指令的 8788 埠已被另一個既有預覽占用，沒有停止它；改選獨立埠後啟動成功，CLI 另補明確的埠占用檢查。瀏覽器初測的通用製造樣本與定位假設已修正，舊結果另存，不列為成功。公開部署最初路由尚未可用，後續真實 HTTP 200 與公開瀏覽器驗證才標完成。

## 限制

這是八種已提供範本及可擴充流程引擎，不能聲稱所有產業皆經驗證或可直接正式營運。沒有團隊帳號／SSO、法遵、食安、薪資、真金流／會計／發票／物流或正式維運承諾。

公開資料 72 小時無活動後清除，cookie 清除會進入另一個獨立工作區。工作區有紀錄與操作配額；JSON 匯入封裝上限 32 KB，較大的匯出不能宣稱能以此上限還原。自架模式仍為 SIM，沒有自動資料清除，請自行備份。

MIT 適用本專案新程式與原創介面，沒有重新授權原 freedom-platform。依賴使用各自授權，原文見 `docs/licenses/`。沒有把憑證、本機會員資料或原平台品牌圖像帶入發布包。

自由工坊正式頁面的入口以獨立上游 PR 提出，維護者合併前不能稱為原站已上線。原始驗收、失敗、修正後結果及部署紀錄存於不發布的 `.audit-tmp/`。
