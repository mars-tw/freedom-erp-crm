# LINE 個人訊息 AI 中台：PM UI 走查紀錄

日期：2026-10-20
驗收站：`http://localhost:8992/line-inbox-demo`
工具：ego-browser TaskSpace 1 / Page p1

## 走查結果

PM 已完成 Fish、家人、分會管理員三種身分的桌面與手機走查。每種身分均走過可見導覽、收件匣訊息、來源篩選、搜尋、四象限、已核准待辦與可用操作；待辦狀態測試後已切回原狀態。

| 身分 | 桌面 | 手機 | 結果 |
|---|---|---|---|
| Fish | 已完成 | 已完成 | 設定、同步、備份、分類偏好、遮罩與 OpenChat disabled 通過 |
| 家人 | 已完成 | 已完成 | 只看摘要／四象限／核准待辦，沒有 Fish 設定入口 |
| 分會管理員 | 已完成 | 已完成 | 可協作待辦，沒有原文、分類、回覆與 Fish 設定操作 |

手機固定為 `390px`；實測 `innerWidth=390`、`scrollWidth=375`，沒有橫向溢出。ego-browser 需在同一回合設定 viewport，否則新回合會恢復桌面寬度。

## 共通檢查

- 沒有看到 401、500 或裸露原始訊息。
- 原始訊息區域都顯示「原始訊息留在本機」與遮罩摘要。
- OpenChat 回覆維持 disabled／測試限制。
- 所有可見導覽與收件匣、四象限、待辦按鈕均有可觀察結果；無作用的通知「查看收件匣」在沒有通知時不存在。

## 截圖

截圖保存在本機 `/tmp/line-personal-ai-inbox-ui/`，沒有加入版控：

- Fish：`fish-desktop-*.png`、`fish-mobile-*.png`
- 家人：`family-desktop-*.png`、`family-mobile-*.png`
- 分會管理員：`branch-admin-desktop-inbox.png`、`branch-admin-desktop-quadrants.png`、`branch-admin-desktop-tasks.png`、`branch-admin-desktop-overview-final.png`
- 分會管理員手機（固定 390px）：`branch-admin-mobile-inbox-fixed.png`、`branch-admin-mobile-quadrants-fixed.png`、`branch-admin-mobile-tasks-fixed.png`、`branch-admin-mobile-overview-final-fixed.png`

## 尚未通過的外部關卡

`pnpm run verify:public` 實跑 29 次，均回報 `Public HTML still references a different build.`。本輪未部署公開站，因此公開站一致性與 Fish 親自驗收仍未完成。
