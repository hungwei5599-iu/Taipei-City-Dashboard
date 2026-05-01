# Agent Ops：交接整理、Gemini 委派、JIT Tests

> 這份文件是 agent 工作流入口。目標是減少分散文件，讓新人或下一個 agent 先讀一份就能知道怎麼收尾、怎麼委派、怎麼選測。

## 1. Neat-Freak 交接整理

全域 skill 已安裝並翻譯為正體中文：

- `~/.codex/skills/neat-freak/SKILL.md`
- `~/.codex/skills/neat-freak/references/agent-paths.md`
- `~/.codex/skills/neat-freak/references/sync-matrix.md`

使用時機：

- 完成一段開發、驗證、交接或 demo 準備。
- 使用者要求「同步一下」「整理文件」「收尾」「新人能直接上手」。
- 發現 `AGENTS.md`、`README.md`、`docs/`、handoff 或 agent 記憶互相矛盾。

整理規則：

- 合併優於追加：新資訊若更新既有說明，就改原段落。
- 刪除優於保留：完成的臨時計畫、失效截圖、過期假設不要留在入口文件。
- 絕對日期：寫 `2026-04-30` 這類日期，不寫相對時間詞。
- 受眾分層：
  - `AGENTS.md`：agent 操作契約、紅線、路由。
  - `docs/README.md`：新人文件入口。
  - `docs/ops/`：PM、DRI、交接與工作流。
  - `docs/1-Architecture/`：正式架構與長期設計。

本輪整理結果：

- 保留：`docs/ops/architecture-deepening-candidates.md`，作為大型 Module 深化候選。
- 合併：三份工作型 ops 文件內容收斂到本文件。
- 刪除：三份已合併的工作文件，避免 docs/ops 變成流水帳。

## 2. Gemini CLI 委派規則

這台機器使用個人 Google 帳號 OAuth，不使用 `GEMINI_API_KEY`。Codex/OMX 不能負責登入，只能消費已登入完成後的本機 OAuth 快取。

硬規則：

- 不直接呼叫 `gemini`。
- 只呼叫 `~/bin/gemini-oauth-delegate`。
- 使用前先跑 `~/bin/check-gemini-oauth-ready`。
- 若 preflight 失敗，回報人類需要在互動式 terminal 完成 Google OAuth 登入，不要嘗試開瀏覽器登入。

專案內來源：

- `tools/gemini-oauth-delegate`
- `tools/check-gemini-oauth-ready`

安裝到本機：

```bash
mkdir -p ~/bin
cp tools/gemini-oauth-delegate tools/check-gemini-oauth-ready ~/bin/
chmod +x ~/bin/gemini-oauth-delegate ~/bin/check-gemini-oauth-ready
```

驗收：

```bash
~/bin/check-gemini-oauth-ready
```

成功標準：

- 輸出包含 `STATUS: READY`
- 不出現 browser authentication prompt
- 不卡住

失敗時的標準回報：

```text
Gemini OAuth session is not ready.
Run `gemini` manually in a real terminal, complete Google login, then retry.
```

Gemini 輸出只作 advisory review；最終決策與驗證仍以本機 repo 證據為準。

## 3. JIT Test Dry-Run Selector

工具：

- `tools/jit_tests.py`

目的：根據 changed files 建立最小 affected test 建議，不取代 CI，不新增 dependency。

命令：

```bash
python3 tools/jit_tests.py --changed Taipei-City-Dashboard-FE/src/assets/configs/hackathon/heatFamilyWorker.js
python3 tools/jit_tests.py --changed Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go
python3 tools/jit_tests.py --changed docs/ops/agent-ops.md
python3 tools/jit_tests.py --from-git-diff
python3 tools/jit_tests.py --json --changed <path>
```

支援範圍：

| Lane | 相依圖訊號 | 測試命令 |
| --- | --- | --- |
| FE | JS/Vue relative imports, test imports, same feature naming fallback | `cd Taipei-City-Dashboard-FE && node tests/components/<spec>` |
| BE | Go package path, same package `_test.go`, local module imports | `cd Taipei-City-Dashboard-BE && go test <package>` |
| DE | Python imports, same directory tests, `test_*.py` naming | `cd Taipei-City-Dashboard-DE && python -m pytest <test>` |
| Docs | docs-only detection | skipped with reason |

驗收案例：

1. 改 `Taipei-City-Dashboard-FE/src/assets/configs/hackathon/heatFamilyWorker.js`
   - 預期：命中 `Taipei-City-Dashboard-FE/tests/components/HeatFamilyWorker.spec.js`
2. 改 `Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go`
   - 預期：命中 `go test ./app/services/ai/tools`
3. 改 `docs/ops/agent-ops.md`
   - 預期：不跑測試，輸出 docs-only skip reason

## 4. Symphony / Linear 待建卡

Linear MCP 在 `2026-04-30` 回傳 `Session expired`，`http://127.0.0.1:4000/` 也無法從本 session 連線。因此任務卡先放在本節，待 Linear 重新認證後建立到 Symphony project。

### Install zh-TW neat-freak cleanup skill

- DRI：PM / workflow owner
- Acceptance:
  - `~/.codex/skills/neat-freak/SKILL.md` exists.
  - Skill body and references are Traditional Chinese.
  - Project workflow is documented in `docs/ops/agent-ops.md`.
- Verification:
  - `test -f ~/.codex/skills/neat-freak/SKILL.md`
  - `grep -n "潔癖" ~/.codex/skills/neat-freak/SKILL.md`

### Identify large Module deepening candidates

- DRI：Architecture owner
- Acceptance:
  - Candidate list uses Module, Interface, Implementation, Depth, Seam, Adapter, Leverage, Locality.
  - Candidates cover FE Hackathon display Module, BE AI tool Module, and DE ETL Module.
  - Each candidate includes files, problem, deletion test, solution, and benefits.
- Verification:
  - `grep -n "Deletion test" docs/ops/architecture-deepening-candidates.md`

### Add JIT test dependency graph dry-run selector

- DRI：Test/tooling owner
- Acceptance:
  - Script exists at `tools/jit_tests.py`.
  - Supports `--changed`, `--from-git-diff`, and `--json`.
  - FE, BE, docs-only acceptance cases match the expected selector output.
- Verification:
  - `python3 tools/jit_tests.py --changed Taipei-City-Dashboard-FE/src/assets/configs/hackathon/heatFamilyWorker.js`
  - `python3 tools/jit_tests.py --changed Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go`
  - `python3 tools/jit_tests.py --changed docs/ops/agent-ops.md`
