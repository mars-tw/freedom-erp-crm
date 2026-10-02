# 參與開發

先看現有 Issue／PR，描述產業、實際操作與預期結果。修改前讀 `AGENTS.md`，使用 `codex/` 或自己的工作分支；不提交私人資料、token 或本機工作區。

新增範本必須有實際用途、樣本與可用模組，附上從建立到完成的流程測試。不可只改標籤就聲稱具備法遵或正式會計功能。

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run worker:dry-run
```

PR 列變更用途、可見結果、實跑測試及限制。保留 MIT 與依賴原授權；請用自己的模擬工作區，避免影響其他訪客。
