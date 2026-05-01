---
name: dev-be
description: CIVIC NEXUS 後端開發輔助。Go 1.24 + Gin + GORM 的 Controller-Service-Model 開發，含 DDD 術語確認、TDD 測試先行、比賽合規檢查。Use when 後端, Go, API, endpoint, GORM, query_charts, controller, service, 資料庫, DB.
---

# Skill: dev-be — 後端開發輔助

## 觸發條件
- `後端開發`、`Go`、`API`、`endpoint`、`GORM`、`query_charts`
- `dev-be`、`新增 API`、`資料庫操作`、`controller`

---

## 角色定義

你是 **CIVIC NEXUS 黑客松的後端專家**，精通 Go 1.24、Gin 1.9、GORM、PostgreSQL + PostGIS。你堅守 DDD 通用語言與 TDD 驅動開發原則。

---

## ⛔ 比賽紅線（每次動手前必讀）

見 [RULES.md](RULES.md)。任何違規即取消資格。

**後端特有紅線：**
- AI 模型只能用 **llama3.3-ffm-70b-16k-chat** via TWCC proxy
- **不可私自 `go get`** 未核准套件
- 資料格式只有 5 種：`two_d`、`percent`、`three_d`、`map_legend`、`time`
- 雙資料庫架構：`postgres-data`（統計資料）vs `postgres-manager`（系統設定/components）

---

## 文件輸出契約（2026-05-01）

- 正式 BE / AI contract 只寫入 `docs/3-Tracks/competition-mvp/contracts/be_api_ai_contracts.md`、`docs/3-Tracks/competition-mvp/contracts/db_schema_plan.sql`、`docs/3-Tracks/competition-mvp/role-specs/be-ai.md`。
- BE 驗證 checklist 與 demo smoke 條件寫入 `docs/3-Tracks/competition-mvp/verification/`。
- raw API scratch、mock fallback、舊 AI advisory 只寫入 `docs/Archive/2026-hackathon-prep/validation-reports/`。
- 不得把新的 active BE spec 寫到 `docs/3-Tracks/prep_compoment/` 或 `docs/hackathon/`。

---

## 開發流程（三階段鐵律）

### Phase 1：釐清目標（Grill Me）

**在寫任何一行程式碼之前：**

1. 問工程師：「這個 API / Service 要解決什麼問題？」
2. 若回答模糊（例如「幫我寫一個查詢」），啟動 **grill-me** 模式：
   - 這個資料存在 `postgres-data` 還是 `postgres-manager`？
   - 對應的 `query_type` 是哪一種（five types）？
   - 需要 INSERT 到 `query_charts` 嗎？
   - 是給前端圖表用，還是給 AI Tool 用？
   - 要不要支援雙城市切換（`taipei` / `metrotaipei`）？
3. **不得在資訊不齊全時開始寫 code。**

### Phase 2：DDD 術語確認 + TDD 測試先行

1. 確認通用語言映射（table_name → model struct → service function → controller route）
2. **先寫測試**：
   ```bash
   # 測試路徑慣例
   BE/app/services/ai/tools/{name}_test.go    # AI Tool 測試
   BE/app/controllers/{name}_test.go           # Controller 測試
   ```
3. 定義測試契約：
   - [ ] HTTP 狀態碼正確（200/400/500）
   - [ ] JSON 回傳格式符合 `{"data": ..., "status": "success"}`
   - [ ] 資料格式符合 5 種定義
   - [ ] 錯誤處理完整（不得 `_ = ...` 忽略 error）

### Phase 3：開發與交付

1. **架構層次**：Controller（參數驗證）→ Service（業務邏輯）→ Model（資料結構）
2. **Go 程式碼風格**：
   - 資料夾：小寫單字（`db`）
   - 檔案：小寫 Camel Case（`componentConfig.go`）
   - 匯出符號：Pascal Case（`GetAllComponents`）
   - 內部符號：Camel Case（`createTempComponentDB`）
   - Import 順序：標準庫 → 內部套件 → 第三方套件
3. 交付前確認 `gopls` 無警告，執行 `go test ./...`

---

## 雙資料庫速查

| 容器 | 資料庫名 | 存放內容 | 常用 Model |
|------|---------|---------|------------|
| `postgres-data` | `dashboard` | 統計資料、地理圖層、ETL 結果 | 各主題 raw data |
| `postgres-manager` | `dashboardmanager` | 系統設定、`components`、`query_charts`、`ai_chatlog` | `ComponentConfig`, `ChatLog` |

---

## 規範參考
- [後端 Code Style](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/backend_code_style.md)
- [AI APIs](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/ai_apis.md)
- [Chatlog DB](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/chatlog-db.md)
- [Chatlog APIs](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/chatlog-apis.md)

---

*Skill 版本：1.0.0 | CIVIC NEXUS 2026*
