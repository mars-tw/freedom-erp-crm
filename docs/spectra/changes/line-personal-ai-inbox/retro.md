# LINE 個人收件匣第一里程碑 Retro

日期：2026-10-20
PR：[mars-tw/freedom-erp-crm#2](https://github.com/mars-tw/freedom-erp-crm/pull/2)
範圍：本地 simulated 第一里程碑、Fish 驗收、PR 收尾；不含真實 LINE／AI／Google Drive／Email provider。

## 結論先講

本輪最大的正向結果，是在接觸真實個人 LINE 前先把資料邊界、家庭權限、四象限與受控回覆流程做成可驗收的 simulated 工作台；Fish 已完成本地驗收，既有測試也沒有退步。

最大的流程問題，是「公開站驗證」仍混在本地回歸 task 裡。公開站本輪沒有部署，`verify:public` 因 build fingerprint 不同重試 29 次，最後仍失敗；這不影響本地第一里程碑，但讓 tasks 與 flow-status 長時間保留舊狀態，也造成收尾判斷不清楚。

## 八類檢查

| 類別 | 發現 | 判斷 | 修法 |
|---|---|---|---|
| Navigation | `flow-status.md`、`tasks.md`、`pm-state.md` 在 Fish 驗收後仍寫「尚未開始」。 | 高 | 驗收完成當輪立即更新三份狀態；已在本輪補上。 |
| Automated checks | `verify:public` 在「本輪未部署」時仍重試 29 次。 | 高 | 將公開站部署前置檢查與遠端 fingerprint 驗證拆開；明確判定「未部署」後 fail-fast。另開 change 實作。 |
| Coding standards | simulated adapter、狀態標籤、冪等與權限測試有清楚契約；沒有發現需要新增文字規則的重複違規。 | 低 | 保留現有 adapter contract 與 Gherkin／Playwright 對應。 |
| Global AGENTS.md | 本輪不需要新增全域規則；通用規則已涵蓋驗收、公開驗證與 PR。 | 低 | 不回寫全域檔案，避免把單一 repo 的問題擴大成全域規則。 |
| Tool economy | 重複執行公開驗證消耗時間，且第一次就能看出未部署。PR 第一次建立也因 fork branch 實際名稱含 owner prefix 而失敗。 | 中 | PR 前先用 `git ls-remote`／GitHub compare 確認 head；公開驗證加入一次性 preflight。 |
| No-ops | 在沒有部署的前提下執行公開站驗證，結果可預期不會變。 | 中 | 把「部署授權」與「公開驗證」列為另一個 change 的 `[等老魚]` 門檻；未授權時只跑本地 gate。 |
| Information access | 本地測試、UI 走查與未動工 provider 的邊界已記錄；公開站未部署狀態要更早顯示在收尾頁。 | 中 | PR Evidence 同時列出通過證據與未驗證 gate；已在 PR #2 寫明。 |
| 規格對齊 | Grilling 先確認「個人／家人使用、先 simulated、真實 provider 後開 change」，避免把官方帳號或商業產品方向混進來。 | 正向 | 後續真實 LINE、AI、Drive、Email 各自開 change，沿用同一資料邊界與 scope gate。 |

## 已完成的修正

- 將 Fish 驗收完成寫回 `flow-status.md`、`tasks.md`、`pm-state.md`。
- 保留公開站 `7.1` 未完成，不把本地驗收誤報為線上驗證。
- 建立 PR #2，PR body 同時列出通過證據、未驗證 gate、可逆性與影響範圍。
- 不修改全域 AGENTS 或 skills，因為本輪沒有需要全域化的新規則。

## 後續待辦

1. 另開 change：公開站部署前置檢查與 `verify:public` fail-fast。
2. 另開 change：真實 `linejs` 個人帳號同步，先定義登入、session 保存、原文留存與斷線重試。
3. PR #2 合併後，再依 repo 規則回收整合工作樹；本輪不執行 `spectra archive`，因 `tasks.md` 的公開站 task 仍未完成。

## 待 Fish 確認的全域規則

無。本輪沒有要寫回全域規則的項目。
