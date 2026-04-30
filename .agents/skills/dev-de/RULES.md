# ⛔ CIVIC NEXUS 2026 — 比賽紅線（共用規則）

**以下任何一項違規即取消資格。所有 Skill 共用此規則，每次動手前必讀。**

## 1. 圖表庫限制
- ✅ 允許：`apexcharts`（Vue 3 wrapper：`vue3-apexcharts`）
- ❌ 禁止：ECharts、Chart.js、D3、Recharts、Highcharts 等

## 2. AI 模型限制
- ✅ 允許：`llama3.3-ffm-70b-16k-chat`（透過 TWCC proxy）
- ❌ 禁止：OpenAI、Anthropic、Gemini、其他任何 LLM

## 3. AI 呼叫路徑
- ✅ 允許：前端 → Go proxy (`/api/v1/ai/chat/twai`) → TWCC
- ❌ 禁止：前端直接帶 API Key 呼叫任何 AI 服務

## 4. 套件管理
- ✅ 允許：`package-lock.json` 白名單內的套件
- ❌ 禁止：私自 `npm install` / `go get` 未核准套件

## 5. 資料格式
- ✅ 允許：`two_d`、`percent`、`three_d`、`map_legend`、`time`
- ❌ 禁止：自訂新資料結構繞過現有 API

## 6. Git 操作
- ✅ 僅推送到團隊倉庫：`https://github.com/hungwei5599-iu/Taipei-City-Dashboard`
- ❌ 禁止向 upstream (taipei-doit) 執行提交或推送
- 每次 `git add` 前檢查：無 `venv/`、`.env`、`node_modules/`

## 7. 雙資料庫
- `postgres-data`（`dashboard`）：統計與地理資料
- `postgres-manager`（`dashboardmanager`）：系統設定、components、query_charts

---

## 開發鐵律（所有角色通用）

1. **先問目標** → 模糊就 grill-me，不寫模糊的 code
2. **確認術語 (DDD)** → 通用語言映射表必須填完
3. **測試先行 (TDD)** → 先寫測試契約，再寫功能
4. **資訊齊全才動手** → 三項都確認了才開始寫 code
