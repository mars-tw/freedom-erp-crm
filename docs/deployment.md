# 部署公開試用

介面使用 React／Vite，API 使用 Hono／Cloudflare Workers；每位訪客對應一個 SQLite Durable Object。公開 cookie 為隨機 256-bit、HttpOnly、SameSite=Strict，HTTPS 使用 Secure。寫入須有相同 Origin、CSRF、版本與操作代號。

`wrangler.jsonc` 是不含憑證的部署設定。`PUBLIC_DEMO=true` 提供 72 小時閒置資料清除；本機 CLI 生成 `PUBLIC_DEMO=false` 與獨立 `--persist-to` 目錄，不自動清除。

自行部署到自己的 Cloudflare 帳號：

```sh
npm ci
npm run build
npx wrangler login
npx wrangler deploy
```

不需要把 token 寫入專案或公開 CI。請用 SQLite Durable Objects；本專案使用 Workers Free 相容的儲存方式，但仍須遵守帳號配額。[Cloudflare 定價與配額](https://developers.cloudflare.com/durable-objects/platform/pricing/)

本次 mars-tw 公開測試站的網址及部署結果記於[驗收紀錄](verification.md)。自由工坊正式入口以另一個 PR 提出；公開試用站不讀取自由工坊會員或正式資料庫。

沒有 SMTP、銀行、支付商、會計、物流或發票金鑰。私人資料、cookie、`.env`、本機狀態及 `.audit-tmp` 不在發布包。
