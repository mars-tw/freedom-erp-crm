<!--
Every task states the behavior delivered and the verification target. The
Chinese descriptions are for the team; normative capability names remain in
English so the Spectra analyzer can cross-reference the specs and design.
-->

## 1. Runtime boundary and domain storage

- [x] 1.1 `Conversation source projection and deduplication`：三種來源都保留 account scope、conversation id、source type、時間與來源訊息 id，無穩定 id 時用 deterministic fingerprint 去重；證據：`來源投影保留三種來源並以穩定 fingerprint 去重` 通過。
- [x] 1.2 依 `Keep the existing Worker + BusinessWorkspace Durable Object as the runtime boundary` 分離 LINE keyspace 與既有匿名 ERP/CRM 工作區；證據：`tsc --noEmit`、全套 `pnpm test` 202 tests（201 pass、1 skip、0 fail）通過。
- [x] 1.3 依 `Build the first milestone with a local fake connector and rule-based AI adapter` 建立可注入的訊息、分類、待辦候選、草稿與同步資料模型；證據：LINE focused unit/API 18/18、adapter contract test 通過，未使用外部 credentials。

## 2. 收件匣、分類與協作

- [x] 2.1 `Inbox dashboard and quadrant summary`：Fish 首頁同時顯示待處理收件匣、四象限摘要與重要且緊急數量；證據：Playwright focused e2e 首頁情境通過。
- [x] 2.2 `Quadrant classification and review queue`：低信心分類進待確認佇列，Fish 修正後才進選定象限且不建立第五象限；證據：focused unit 與 Playwright 首頁分類確認情境通過。
- [x] 2.3 `Fish classification preferences`：Fish 的分類修正形成可查看、修改、清除且不套用到家人的偏好；證據：後端 `Fish 分類偏好可管理，且後續同來源訊息會參考偏好`、前端 `Fish 可以查看、修改與清除自己的分類偏好` 通過。
- [x] 2.4 `Historical backfill progress`：最近 30 天歷史補抓以批次保存進度、可續抓且單批失敗不清除已完成資料；證據：後端 `歷史補抓失敗不清除已完成批次，恢復後可繼續` 與前端同步恢復／繼續補抓情境通過。
- [x] 2.5 `Sync state and outbound gate`：同步狀態顯示最後成功時間，offline 時 UI/API 都阻擋送出，恢復後只補同步不自動送出；證據：API focused test 與 Playwright 離線／補抓情境通過。
- [x] 2.6 `Approved task collaboration`：只有 Fish 能把候選轉成正式待辦，正式待辦保存完整協作欄位，家人只能更新允許的狀態與備註；證據：後端 `正式待辦保留協作欄位，家人只能改狀態與備註` 與前端家人待辦情境通過。
- [x] 2.7 `Draft review and controlled send`：Fish 看到完整摘要、對象、頻道、草稿與附件後逐筆確認，OpenChat gate 未通過時明確停用；證據：API OpenChat gate／idempotency test 與 Playwright OpenChat disabled 情境通過。
- [x] 2.8 `Attachment metadata display`：第一版只顯示附件名稱、類型與狀態／連結，不顯示 OCR 或語音轉錄；證據：後端 attachment projection test 與前端訊息詳情 metadata rendering 通過。

## 3. 家庭身份與權限

- [x] 3.1 `Fish bootstrap and separate identity boundary`，並依 `Separate family identity from the existing anonymous demo session`：首次部署只建立一個 Fish 管理員，並以獨立 `line_session` 與既有 `freedom_session` 隔離；證據：LINE API bootstrap／登入 focused test 與既有全套回歸通過。
- [x] 3.2 `Family session lifecycle`：登入、登出、idle expiry、Fish 撤銷裝置工作階段都在伺服器端生效；證據：`Fish 可以撤銷其他裝置工作階段，撤銷後不能再讀取中台` 通過，idle expiry 沿用既有 session expiry 契約。
- [x] 3.3 `Role-scoped access`：Fish 可做原文依賴的審核、分類、audit、待辦核准與回覆，家人只可讀遮罩摘要、四象限、核准待辦並更新允許欄位；證據：family RBAC API focused test 與 Playwright 家人檢視情境通過。
- [x] 3.4 `One-time email password reset`：家人透過 simulated Email outbox 取得 15 分鐘一次性連結，成功後立即失效，重用不改密碼；證據：API reset token test、前端 request／complete／重新登入 e2e 通過；真實 Email delivery 未動工。
- [x] 3.5 `CSRF and rate-limit protection`：所有 state-changing family endpoint 驗證 CSRF，bootstrap/login/reset 受限速保護且錯誤不改資料；證據：LINE API CSRF focused test 通過，錯誤回應使用既有 error code 形狀。

## 4. 資料邊界、稽核與通知

- [x] 4.1 `Masked data projection` 並依 `Keep raw LINE content local and send only masked projections to the cloud UI` 實作：Cloudflare 與家人回應只含遮罩摘要、來源與必要欄位，外部 AI payload 不含設定的敏感值；證據：遮罩 focused test、family response test 與秘密掃描通過。
- [x] 4.2 `Append-only scoped audit events` 並依 `Use append-only audit events and idempotent state transitions` 實作：安全敏感操作記錄 actor、target、結果、時間、action id 與 error code，重送不產生第二筆業務結果；證據：API candidate approve idempotency focused test 通過。
- [x] 4.3 `Retention and important holds`：原始訊息、無用附件索引與加密備份依 90 天清理，重要保留例外，摘要、四象限、待辦與必要 audit 依政策保留；證據：保存期限 focused test 通過。
- [x] 4.4 `Fish-only masked urgent notifications`：重要且緊急事件只建立 Fish scoped simulated notification，通知只有遮罩摘要與中台入口；證據：Fish-only API notification test、首頁 simulated notification e2e 通過；真實瀏覽器／裝置推播未動工。

## 5. Connector、失敗狀態與備份邊界

- [x] 5.1 `Replaceable simulated adapters`：connector、AI、notification、email、backup 都由介面注入，沒有外部 credentials 仍能用 deterministic fixtures；證據：`simulated adapters 具備 connector、AI、通知、Email 與備份的可替換契約` 通過。
- [x] 5.2 `Connector continuity and retry queue`：模擬備份不可用時仍寫入本機並保留 intake，待上傳項目進入可重試佇列；證據：backup control／ingest／retry API test 通過，UI 顯示 error 與 queue 狀態。
- [x] 5.3 `Explicit integration capability states` 並依 `Make failure state explicit and stop outbound actions while offline` 實作：simulated、disabled、offline、paused、backfilling、error 都可被 UI/API 看見，disabled outbound action 回穩定錯誤且保留草稿；證據：API offline／OpenChat gate focused test 與 Playwright 同步情境通過。
- [x] 5.4 `Encrypted backup versions and retention` 並依 `Use a simulated backup adapter before Google Drive integration` 實作：先本機加密再建立增量版本，限制專用備份範圍，不上傳 LINE 明文並受 90 天輪替；證據：模擬備份加密／錯誤金鑰 focused test 通過。
- [x] 5.5 `Preview-only backup restore`：只有 Fish 可預覽與選版本，還原到隔離位置且不覆蓋現有資料，錯誤復原金鑰 fail closed；證據：backup preview／restore integrity API test 通過，沒有明文 fallback。

## 6. Dashboard 與行為驗收

- [x] 6.1 讓 dashboard、登入／重設密碼、家人檢視、同步狀態與備份狀態呈現 simulated／disabled 標籤；桌面與 320、360、390、414、600、768、820、1024、1180、1440px 寬度均無橫向溢出，執行 Playwright viewport scan 與前端 Gherkin 全部情境；證據：line-inbox e2e 9/9 通過。
- [x] 6.2 建立三種身分的測試帳號與切換方式：總管理員對應 Fish、一般會員對應家人、分會管理員作為明確權限邊界測試帳號；帳號為 fake seed（`family@example.test`、`branch-admin@example.test`），不含真實憑證；證據：role matrix API／e2e 通過。
- [x] 6.3 完成後端 Gherkin 與 API 測試劇本的自動化對應；證據：LINE focused unit/API 18/18、focused Playwright 9/9、全套 100 Playwright e2e 通過、全套 202 tests（201 pass、1 skip、0 fail）、`tsc --noEmit`、`pnpm run build` 與 Worker dry-run 通過。

## 7. 回歸、四關驗收與交付

- [ ] 7.1 重跑既有 ERP/CRM 單元、API、public build 與 e2e 回歸測試，確認匿名 `freedom_session` 與既有模擬資料行為不變；`pnpm test` 為 202（201 pass、1 skip、0 fail）、`pnpm run test:e2e` 為 103/103、build/typecheck/dry-run 通過，但 `pnpm run verify:public` 29 次仍回報公開 HTML 是不同 build，因此本 task 保留未完成。
- [x] 7.2 PM 以 ego-browser 走查 Fish、一般會員、分會管理員三種身分的桌面與手機畫面，逐一操作可見按鈕並確認沒有 401／500、破版、假按鈕或裸露 raw content；手機固定 390px 並實測無橫向溢出。紀錄與截圖路徑：`docs/sr-drafts/line-personal-ai-inbox-ui-walkthrough.md`。
- [x] 7.3 依 design.md 的 `observable behavior`、`interface and data shape`、`failure modes`、`acceptance criteria` 與 `Fish 驗收清單` 完成四關：本功能 e2e 全綠、舊功能測試全綠、PM ego-browser 桌面＋手機三身分走查、Fish 已按白話清單完成驗收；`spectra analyze line-personal-ai-inbox --json` 與 `spectra validate line-personal-ai-inbox` 已執行並保存輸出。公開站驗證另由 7.1 保留未完成。
- [x] 7.4 Fish 驗收清單與 `Scope boundaries`：登入／登出、首頁收件匣與四象限、待確認分類、待辦核准與家人協作、逐筆草稿確認、OpenChat disabled、離線恢復、Email reset、遮罩與通知、附件 metadata、備份模擬狀態均完成本地驗收；真實 LINE／AI／Google Drive／Email provider 明確標記未動工。
