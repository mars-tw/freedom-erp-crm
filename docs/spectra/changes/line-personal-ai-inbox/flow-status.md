---
change: line-personal-ai-inbox
updated: 2026-10-20
---

# dev-flow 進度

## ① Grilling 對齊

- [x] 已完成 30 題需求、安全邊界與第一里程碑範圍確認。
- 證據：`docs/sr-drafts/line-personal-ai-inbox-notes.md`。

## ② 詞彙表與 Gherkin 測試劇本

- [x] 已建立並獲 Fish 確認 `CONTEXT.md`。
- [x] 已建立並獲 Fish 確認 `e2e/features/line-personal-ai-inbox-frontend.feature`。
- [x] 已建立並獲 Fish 確認 `e2e/features/line-personal-ai-inbox-backend.feature`。

## ③ Spectra SR

- [x] `[PM]` 建立四份英文 capability specs、`tasks.md` 與本進度表。
- [x] `[PM]` 執行 `spectra analyze line-personal-ai-inbox --json` 與 `spectra validate line-personal-ai-inbox`；Coverage／Consistency／Gaps 為 0，validate 為 valid。
- [x] Fish 以本次實作指示授權依既有 proposal、design、specs 與 tasks 進入本地實作。

## ④ 實作

- [x] 在本工作樹完成 fake LINE domain／Worker API、Fish／家人／分會管理員測試身份與 RBAC、遮罩／稽核／備份佇列／隔離還原及 Dashboard；沒有接入真實 provider。

## ⑤ 本功能測試

- [x] focused LINE unit/API 18/18 與 Playwright 9/9 通過；全套 Playwright 103/103 通過；測試檔與前後端 Gherkin 已納入 change。

## ⑥ 舊功能回歸

- [x] 本地全套 tests 202（201 pass、1 skip、0 fail）、`pnpm run build`、Worker dry-run 與本地 typecheck 通過；完整 e2e 103/103 通過。
- [ ] 外部 `verify-public-build` 未驗證：29 次檢查都回報公開 HTML 仍是不同 build，且本次未部署；不列為完成。

## ⑦ PM 四關走查

- [x] PM 已用 ego-browser 走查 Fish、家人、分會管理員的桌面／390px 手機畫面，逐一操作可見導覽、收件匣、來源篩選、搜尋、四象限與核准待辦；設定頁、分類偏好儲存／清除、權限邊界提示、家人遮罩、分會管理員邊界與無設定入口均通過。紀錄：`docs/sr-drafts/line-personal-ai-inbox-ui-walkthrough.md`。
- [ ] 公開站仍未驗證；`pnpm run verify:public` 實跑 29 次皆回報公開 HTML 是不同 build。本輪未部署；Fish 本地驗收已完成，但不替代公開站驗證。

## ⑧ Fish 驗收

- [x] Fish 已依白話清單完成驗收並確認可以；範圍為本地 simulated 第一里程碑，真實 LINE／AI／Google Drive／Email provider 仍未納入。

## ⑨ PR 與 retro

- [x] PR 已建立：[mars-tw/freedom-erp-crm#2](https://github.com/mars-tw/freedom-erp-crm/pull/2)；retro 結論記錄於 `docs/spectra/changes/line-personal-ai-inbox/retro.md`，白話版已產出至 `/Users/fishtv/Downloads/line-personal-ai-inbox-retro-2026-10-20.html` 並以 ego-browser 開啟。沒有回寫全域規則。

## ⑩ Archive

- [ ] 尚未動工；需在 tasks 全部完成、validation 0 warnings、retro 完成後執行 `spectra archive`。

## 明確未動工

- 真實 `linejs` 個人帳號登入與同步。
- 真實 AI Provider、Google Drive OAuth／加密上傳與 Email delivery provider。
- 真實 OpenChat 讀取、歷史補抓與送出能力。
