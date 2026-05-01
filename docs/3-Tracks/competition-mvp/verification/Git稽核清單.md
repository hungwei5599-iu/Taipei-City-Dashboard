# Git 稽核清單

最後更新：2026-05-01

請在每次競賽 fork 提交前執行。

```bash
git status --short
find . -maxdepth 3 \( -name ".env" -o -name "node_modules" -o -name "venv" -o -name ".venv" \) -print
git diff --cached --stat
git diff --cached -- package.json go.mod go.sum
```

## 通過條件

- 沒有 `.env` 檔被 staged。
- 沒有 `node_modules`、`venv` 或 `.venv` 被 staged。
- 沒有未核准的 dependency 檔案變更被 staged。
- Commit 訊息描述的是可驗證的單位。
- Commit 日期沒有被手動操控。
- 舊 repository code 沒有以 staged chunk 的方式被複製進來。
