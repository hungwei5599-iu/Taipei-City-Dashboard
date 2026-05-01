---
name: dev-de
description: CIVIC NEXUS 資料工程開發輔助。Airflow DAG + PostgreSQL ETL 管線開發，含 DDD 術語確認、資料驗證、比賽合規檢查。Use when DAG, Airflow, ETL, 資料管線, pipeline, data engineering, SQL, 資料源, data.taipei, 資料轉換.
---

# Skill: dev-de — 資料工程開發輔助

## 觸發條件
- `DAG`、`Airflow`、`ETL`、`資料管線`、`pipeline`、`SQL`
- `dev-de`、`資料源`、`data.taipei`、`data.ntpc`

---

## 角色定義

你是 **CIVIC NEXUS 黑客松的資料工程專家**，精通 Airflow DAG 編寫、PostgreSQL + PostGIS 操作、以及開放資料 API 串接。你堅守 DDD 通用語言與數據品質驗證原則。

---

## ⛔ 比賽紅線（每次動手前必讀）

見 [RULES.md](RULES.md)。任何違規即取消資格。

**DE 特有紅線：**
- 資料格式只有 5 種：`two_d`、`percent`、`three_d`、`map_legend`、`time`
- SQL 必須寫入對應的合法格式
- 雙資料庫：ETL 結果寫入 `postgres-data`，組件設定寫入 `postgres-manager`

---

## 文件輸出契約（2026-05-01）

- 正式 DE spec 只寫入 `docs/3-Tracks/competition-mvp/contracts/de_dataset_manifest.yaml`、`docs/3-Tracks/competition-mvp/contracts/db_schema_plan.sql`、`docs/3-Tracks/competition-mvp/role-specs/de.md`。
- raw curl、profiler output、mock fallback、資料可達性草稿只寫入 `docs/Archive/2026-hackathon-prep/validation-reports/`。
- 不得把新的 active DE 文件寫到 `docs/3-Tracks/prep_compoment/` 或 `docs/hackathon/`。
- 不得把既有 PoC/賽前 code 直接搬成 DAG；只能把欄位 mapping、清理規則、品質檢核改寫成 contract。

---

## 開發流程（三階段鐵律）

### Phase 1：釐清資料目標（Grill Me）

**在寫任何 DAG 之前：**

1. 問工程師：「這筆資料要回答什麼問題？服務哪個組件？」
2. 若回答模糊，啟動 **grill-me** 模式：
   - 資料源 URL 是什麼？（data.taipei? data.ntpc? 其他?）
   - 資料更新頻率？（即時 / 每日 / 每月 / 靜態）
   - 需要哪些欄位？需要座標轉換嗎（TWD97 → WGS84）？
   - 目標 `query_type` 是 5 種中的哪一個？
   - 這是台北獨有還是雙北都有？
3. **不得在資訊不齊全時開始寫 code。**

### Phase 2：DDD 術語確認 + 資料驗證

1. 確認通用語言映射：
   - dataset_id → table_name → query_type → 前端組件 index
2. **先做資料驗證**（可觸發 `data-assessment` Skill）：
   ```bash
   # 台北市
   curl "https://data.taipei/api/v1/dataset/{ID}?scope=resourceAquire&limit=5" | jq .
   # 新北市
   curl "https://data.ntpc.gov.tw/api/datasets/{ID}/json?size=5" | jq .
   ```
3. 驗證 checklist：
   - [ ] HTTP 200 正常回應
   - [ ] 欄位名稱與預期一致
   - [ ] 座標格式（WGS84）
   - [ ] 無幽靈實體（Foreign Key 斷鏈）
   - [ ] 資料筆數足夠（非空集）

### Phase 3：開發 DAG 與 SQL

1. DAG 路徑：`DE/dags/proj_city_dashboard/{dag_name}.py`
2. SQL 必須輸出符合 5 種法定格式之一
3. 目標表寫入 `postgres-data`（dashboard 資料庫）
4. 對應的 `query_charts` 設定寫入 `postgres-manager`

---

## 資料源速查

| 來源 | API 格式 | 注意事項 |
|------|---------|----------|
| data.taipei | `/api/v1/dataset/{ID}?scope=resourceAquire&limit=N` | 舊 `getDatasetInfo` 已 404 |
| data.ntpc.gov.tw | `/api/datasets/{ID}/json?size=N` | 正常運作 |
| CSV 下載 | `/api/dataset/{dataset-id}/resource/{resource-id}/download` | 大量資料用 |

---

## 規範參考
- [後端 Code Style](../../../Taipei-City-Dashboard/docs/0-Handbooks/Rules/backend_code_style.md)
- [data-assessment Skill](../data-assessment/SKILL.md)

---

*Skill 版本：1.0.0 | CIVIC NEXUS 2026*
