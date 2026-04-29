# 儀表板數據開發工作流

> 從原始資料到前端視覺化的標準路徑。進來就能看懂，照做就能交接。

---

## 快速參考：角色職責一覽

| 角色 | 輸入 | 負責 | 產出 | 下游 |
|------|------|------|------|------|
| **PM** | 業務需求 | 定義組件規格、驗收標準 | `資料交接清單.md` | DE |
| **DE** | 交接清單 | ETL Pipeline + 寫入 DB | `hackathon_component_X_ready` table | BE |
| **BE** | DB table schema | 寫 SQL query 掛進 query_charts | API endpoint 吐出標準格式 | FE |
| **FE** | BE API response | 轉 GeoJSON / 渲染圖表 | 儀表板視覺化組件 | 使用者 |

---

## 四個階段

### 1｜資料驗證（PM + DE）

確認資料來源可用。

- 工具：`component-quick-validator` skill
- 確認項目：座標欄位存在（EPSG:4326）、API 可存取、資料筆數合理
- 阻斷條件：座標缺失 / CORS 問題 / 欄位格式不一致 → 回報 PM 定義解法

---

### 2｜ETL 實作（DE）

把原始 API 資料清洗後寫入 PostgreSQL。

- 連線資訊：見 `資料庫連線.md`（Host: `10.101.3.177:5433`，DB: `dashboard`）
- 輸出表名格式：`hackathon_component_X_ready`（X 為組件編號）
- 組件細節：見 `de-handoff-simple.md`（各組件 API 端點、欄位規格、SQL schema）
- 驗收：`SELECT COUNT(*) FROM hackathon_component_X_ready` > 0 即完成

---

### 3｜後端對接（BE）

把 DE 寫好的 table 接進 Dashboard API。

- `DBDashboard`（port 5433）已在 `database.go` 定義
- 在 `query_charts` table 新增一筆：填入 `index`（組件 index）、`city`、`query_type`、`query_chart`（原始 SQL）
- C1（地圖）用 `map_legend` 或自訂 raw query；C8（圖表）用 `two_d` / `three_d`
- 詳細 struct + SQL 範例：見 `資料庫連線.md`

---

### 4｜前端渲染（FE）

把 API 資料轉成地圖或圖表。

- 地圖組件（C1）：API 回傳 `latitude` / `longitude` → 前端組成 GeoJSON → Mapbox GL symbol layer
- 圖表組件（C8）：直接用 ApexCharts BarChart，X 軸為 `district_name`，Y 軸為 `capacity_gap_abs`
- Popup 顯示：`title` / `location_name` / `event_time`

---

## 當前進度

| 組件 | DE 完成 | BE 對接 | FE 完成 |
|------|---------|---------|---------|
| C1 藝文活動地圖 | ✅ | ⬜ | ⬜ |
| C8 避難收容缺口 | ✅ | ⬜ | ⬜ |
| C3 C4 C5 C6 C9 | 部分 | ⬜ | ⬜ |

---

*更新：2026-04-22 ｜ PM：羅浚*
