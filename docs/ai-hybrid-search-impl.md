# AI Hybrid Search 實作說明

## 修改檔案

| 檔案 | 類型 |
|---|---|
| `Taipei-City-Dashboard-BE/app/services/ai/tools/dataset_tools.go` | 新增 |
| `Taipei-City-Dashboard-BE/app/services/ai/tools/registry.go` | 修改 |
| `Taipei-City-Dashboard-FE/src/store/chatStore.js` | 修改 |

---

## 後端：dataset_tools.go

### Dataset Catalog（白名單）

新增 `DatasetCatalogItem` struct 與 `datasetCatalog`，作為 AI 可查詢的資料表白名單。

目前登錄的資料集：

| Table | 說明 |
|---|---|
| `population_age_distribution_tpe` | 台北市人口年齡結構（幼年／工作年齡／老年） |
| `population_age_distribution_new_tpe` | 新北市人口年齡結構（幼年／工作年齡／老年） |

要新增資料集，在 `datasetCatalog` 加入一筆 `DatasetCatalogItem` 即可。

---

### Tool 1：`search_dashboard_datasets`

**用途**：AI 先呼叫這個 tool，根據使用者問題找出可能相關的資料集。

**輸入**：
```json
{ "query": "台北市人口老化" }
```

**實作方式**：對每個 catalog item 的 Title、Description、Examples 做中文關鍵字比對，依命中比例排序後回傳。

**輸出**：
```json
{
  "datasets": [
    {
      "table": "population_age_distribution_tpe",
      "title": "台北市人口年齡結構",
      "description": "...",
      "columns": ["year", "young_population", ...],
      "time_column": "year",
      "score": 0.8
    }
  ]
}
```

---

### Tool 2：`query_dashboard_dataset`

**用途**：AI 確認資料集後，呼叫這個 tool 查詢資料庫。

**輸入**：
```json
{
  "table": "population_age_distribution_tpe",
  "metrics": ["elderly_population"],
  "filters": { "year": 2024 },
  "group_by": [],
  "limit": 50
}
```

**安全機制**（全部在 Go 後端執行）：

| 規則 | 實作 |
|---|---|
| `table` 必須在 catalog 白名單 | 查不到 → 回傳錯誤 |
| `metrics` 欄位必須在該 table 的 `Columns` 清單 | 不合法欄位 → 回傳錯誤 |
| `group_by` 欄位必須在白名單 | 同上 |
| `filters` 的 key 必須在白名單 | 同上 |
| `filters` 的 value 用 parameterized query | 防止 SQL injection |
| `limit` 最大 100 | 超過自動設為 50 |
| 不接受 raw SQL | 無任何 raw SQL 路徑 |

**輸出**：
```json
{
  "table": "population_age_distribution_tpe",
  "rows": [{ "year": 2024, "elderly_population": 380000 }],
  "source": "dashboard database"
}
```

---

## 後端：registry.go

在 `init()` 新增兩個 tool 的註冊：

```go
Register("search_dashboard_datasets", SearchDashboardDatasets)
Register("query_dashboard_dataset", QueryDashboardDataset)
```

---

## 前端：chatStore.js

在 `databaseTools` 陣列新增兩個 tool 的 JSON Schema，讓 `/ai/chat/twai` 請求帶上這兩個 tool 的定義，台智雲 AI 才知道可以呼叫它們。

```
databaseTools = [
  get_current_time,
  get_population_summary,
  search_dashboard_datasets,   ← 新增
  query_dashboard_dataset,     ← 新增
]
```

---

## 對話流程

```
使用者提問
  │
  ├─ /vector/component  （語意搜尋相關圖表）
  │
  └─ /ai/chat/twai  （帶入 chart context + 4 個 tools）
        │
        ├─ AI 判斷只需推薦圖表 → 直接回答
        │
        └─ AI 判斷需要數字 →
              │
              ├─ call search_dashboard_datasets  → 找可用資料集
              └─ call query_dashboard_dataset    → 查 DB → AI 整合回答
```

---

## 目前問題：AI 停在「圖表推薦」而沒有查資料

使用者問「急診待診人數和等候時間」時，向量查詢有找到：

```text
hackathon_component_9_er_overview
```

但 AI 回答：

```text
根據圖表元件，急診待診人數和等候時間的相關圖表元件為 hackathon_component_9_er_overview...
若需要明確數字、統計摘要或年度資料，目前查詢不到相關資料。
```

這種回答不適合直接給使用者，原因是：

1. `hackathon_component_9_er_overview` 是內部元件 index，使用者不需要看到。
2. 使用者問的是資料內容，不是問「哪個圖表元件相關」。
3. 目前 `datasetCatalog` 只有人口年齡資料，還沒有把外部 dashboard DB 的急診 table 登錄進來，所以 `search_dashboard_datasets` 找不到急診資料是預期結果。
4. 只靠 AI 自己判斷是否呼叫 tool 不夠穩，因為模型可能選擇直接根據 chart context 回答。

正確方向是：當使用者問題命中 `hackathon_component_9_er_overview` 時，系統要對應到外部 dashboard DB 的急診資料表，主動查資料庫，再把查詢結果交給 AI 統整。不要把它當成「只能推薦圖表」的情境。

---

## 建議修正：新增 Component → Dataset 對應

目前 `search_dashboard_datasets` 只用使用者 query 去比對 catalog。這對「人口老化」可用，但對「急診待診人數」會失敗，因為 catalog 還沒有登錄外部 DB 裡的急診資料。

外部 dashboard DB 設定來自 `docker/.env`：

```env
DB_DASHBOARD_HOST=192.168.8.80
DB_DASHBOARD_PORT=5433
DB_DASHBOARD_USER=postgres
DB_DASHBOARD_PASSWORD=postgres
DB_DASHBOARD_DBNAME=dashboard
```

急診資料原始 table：

```text
public."hackathon_component_9_Emergency Room News_ready"
```

因為 table 名稱有空白與大小寫，PostgreSQL 查詢時必須加雙引號：

```sql
SELECT *
FROM public."hackathon_component_9_Emergency Room News_ready"
LIMIT 20;
```

實作時建議不要直接讓 AI tool 查這個原始 table 名稱，而是在外部 DB 建一個穩定、全小寫、無空白的 view，例如 `er_overview`。這樣 Go 後端的白名單、欄位驗證、SQL 組裝都會簡單很多。

先確認欄位：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hackathon_component_9_Emergency Room News_ready'
ORDER BY ordinal_position;
```

再依實際欄位建立 view。以下是範例，欄位名稱要依查到的結果調整：

```sql
CREATE OR REPLACE VIEW public.er_overview AS
SELECT
  "HospitalName" AS hospital_name,
  "City" AS city,
  "WaitingCount" AS waiting_count,
  "WaitingMinutes" AS avg_waiting_minutes,
  "DataTime" AS data_time
FROM public."hackathon_component_9_Emergency Room News_ready";
```

建議在後端新增一層 mapping，讓向量查到的 chart component 可以對應到資料表：

```go
type ComponentDatasetMapping struct {
    ComponentIndex string
    Table          string
    DefaultMetrics []string
    DefaultGroupBy []string
}

var componentDatasetMappings = []ComponentDatasetMapping{
    {
        ComponentIndex: "hackathon_component_9_er_overview",
        Table:          "er_overview",
        DefaultMetrics: []string{"waiting_count", "avg_waiting_minutes"},
        DefaultGroupBy: []string{"hospital_name"},
    },
}
```

同時在 `datasetCatalog` 補上急診資料表白名單，例如：

```go
{
    Table:       "er_overview",
    Title:       "雙北急診待診與等候時間",
    Description: "統計各醫院急診待診人數與平均等候時間",
    Columns:     []string{"city", "hospital_name", "waiting_count", "avg_waiting_minutes", "data_time"},
    Metrics:     []string{"waiting_count", "avg_waiting_minutes"},
    Dimensions:  []string{"city", "hospital_name", "data_time"},
    TimeColumn:  "data_time",
    Examples:    []string{"急診", "待診人數", "等候時間", "急診壅塞", "醫院急診", "雙北急診"},
}
```

如果不建立 view，也可以直接把 table 登錄成 `hackathon_component_9_Emergency Room News_ready`，但 `query_dashboard_dataset` 目前用 `models.DBDashboard.Table(params.Table)` 與 `fmt.Sprintf("%s = ?", k)` 組查詢，遇到有空白、大小寫或特殊字元的 table/column 會比較脆弱。因此建議優先用 view 把 table 與欄位整理成 snake_case。

---

## 建議修正：前端傳入 component index

目前 `chartStore context` 只有文字：

```text
1. 急診待診人數與等候時間，index=hackathon_component_9_er_overview，city=雙北，score=0.8872
```

AI 可以讀懂，但後端 tool 沒有直接收到可機器判斷的 component list。建議 `/ai/chat/twai` request 額外帶上 `component_context`：

```json
{
  "session": "session_20260502",
  "messages": [...],
  "component_context": [
    {
      "index": "hackathon_component_9_er_overview",
      "name": "急診待診人數與等候時間",
      "city": "metrotaipei",
      "score": 0.8872
    }
  ],
  "tools": [...]
}
```

後端收到後可以做兩件事：

1. 把 component context 寫進 system prompt，讓 AI 知道可推薦哪些圖表。
2. 優先用 `component.id` 走既有 component chart API / model 取得資料；如果沒有 component id，才用 `component.index` 查 `componentDatasetMappings`。

---

## 更建議：優先復用既有 Component Chart API

目前後端其實已經有抓圖表資料的 API，不一定要讓 AI 直接碰原始 table：

| API | 用途 |
|---|---|
| `GET /api/v1/component/` | 用 `searchbyindex` 找 component 基本資料與 `id` |
| `GET /api/v1/component/:id/chart` | 依 component id 取得目前圖表資料 |
| `GET /api/v1/component/:id/history` | 依 component id 與時間範圍取得歷史資料 |
| `POST /api/v1/vector/component` | 依使用者問題做向量搜尋，回傳相關 component |

前端 `contentStore.js` 已經在用這條資料流：

```js
const response = await http.get(`/component/${component.id}/chart`, {
  params: {
    city: component.city,
    time_from: component.time_from,
    time_to: component.time_to,
  },
});
```

後端實作位置：

| 檔案 | 功能 |
|---|---|
| `Taipei-City-Dashboard-BE/app/routes/router.go` | 註冊 `/component/:id/chart`、`/component/:id/history` |
| `Taipei-City-Dashboard-BE/app/controllers/componentData.go` | API controller |
| `Taipei-City-Dashboard-BE/app/models/componentData.go` | 從 `query_charts.query_chart` 取 SQL，查 `DBDashboard`，轉成圖表資料格式 |

所以急診 AI 查詢有兩種實作路線。

### 路線 A：前端先抓 chart data，再送給 AI

流程：

```text
使用者提問
  |
  +--> /vector/component
  |      找到 hackathon_component_9_er_overview，取得 component.id
  |
  +--> /component/:id/chart?city=metrotaipei
  |      拿到急診圖表資料
  |
  +--> /ai/chat/twai
         把 chart context + chart data summary 一起送給 AI
```

優點：改動最小，直接沿用現有 API。

缺點：前端要多打一個 API，且要把 chart data 壓縮成 AI 好讀的摘要，避免送太多資料。

`chatStore.js` 可以新增：

```js
const fetchComponentChartData = async (component) => {
  const response = await http.get(`/component/${component.id}/chart`, {
    params: {
      city: component.city || "metrotaipei",
      time_from: component.time_from,
      time_to: component.time_to,
    },
  });

  return {
    index: component.index,
    name: component.name,
    city: component.city,
    chart_data: response.data?.data || [],
    categories: response.data?.categories || [],
  };
};
```

然後在 `askTWCCAI()` 的 system prompt 加：

```text
chart data context:
{...整理後的急診 chart data...}
```

AI 回答規則：

```text
- 若 chart data context 有資料，請依該資料統整回答。
- 不要只回答「找到相關圖表」。
- 不要顯示 component index、score、API 名稱。
```

### 路線 B：後端新增 AI tool，直接復用 component data model

更乾淨的方式是新增一個 tool，例如：

```text
get_component_chart_data
```

輸入：

```json
{
  "component_id": 123,
  "city": "metrotaipei",
  "time_from": "2026-05-02T00:00:00+08:00",
  "time_to": "2026-05-02T23:59:59+08:00"
}
```

後端 tool 不要打 HTTP 呼叫自己，而是直接復用既有 model function：

```go
queryType, queryString, err := models.GetComponentChartDataQuery(componentID, city)

switch queryType {
case "two_d":
    data, err := models.GetTwoDimensionalData(&queryString, timeFrom, timeTo)
case "three_d", "percent":
    data, categories, err := models.GetThreeDimensionalData(&queryString, timeFrom, timeTo)
case "time":
    data, err := models.GetTimeSeriesData(&queryString, timeFrom, timeTo)
case "map_legend":
    data, err := models.GetMapLegendData(&queryString, timeFrom, timeTo)
}
```

這樣 AI tool 會走同一套後端查詢邏輯：

```text
query_charts.query_chart
  |
  DBDashboard.Raw(queryString)
  |
  chart data parser
  |
  AI 統整回答
```

優點：權限、查詢格式、既有 chart query 都沿用系統現況，不需要為每張圖表另外手刻 `datasetCatalog`。

缺點：要新增一個 tool schema，並讓 `/ai/chat/twai` 收到 component id 後能呼叫它。

---

## 建議修正：後端預查資料，不完全依賴 AI 自行呼叫 tool

如果採用路線 B，比較穩的作法是在 `ChatWithTWCC` 前增加一個 prefetch step：

```text
User question
  |
  +--> /vector/component 找到相關圖表
  |
  +--> /ai/chat/twai
         |
         +--> backend 根據 component id/index 找 component chart query
         |
         +--> backend 復用 component data model 查 chart data
         |
         +--> 把查詢結果放入 system/context
         |
         +--> AI 只負責統整成人話
```

可以新增一個 helper：

```go
func BuildDatasetContextFromComponents(ctx context.Context, components []ComponentContext) string {
    for _, component := range components {
        if component.ID == 0 {
            continue
        }

        result, err := QueryComponentChartData(ctx, component.ID, component.City, component.TimeFrom, component.TimeTo)
        if err != nil {
            continue
        }

        return result
    }

    return ""
}
```

然後把結果加到 system prompt：

```text
database context:
{...query_dashboard_dataset result...}

回答規則：
- 使用 database context 的數字回答使用者。
- 不要顯示 component index、score、tool 名稱。
- 若 database context 為空，但問題命中急診圖表，請回報「急診資料表查詢失敗或欄位尚未完成 mapping」，不要說成此圖表沒有數值查詢能力。
- 不要說「目前查詢不到相關資料」這種內部流程描述。
```

這樣就算 AI 沒有主動 tool call，也已經有資料可以整理。

---

## 回答策略調整

AI 的最終回答應該像這樣：

```text
目前雙北急診概況可從「急診待診人數與等候時間」圖表查看。根據資料庫最新資料，各醫院目前待診人數與平均等候時間如下：

- A 醫院：待診 12 人，平均等候 35 分鐘
- B 醫院：待診 8 人，平均等候 22 分鐘

整體來看，A 醫院等待壓力較高，建議優先查看該圖表中的醫院別分布。
```

如果後端查詢失敗，才回答：

```text
我有找到「急診待診人數與等候時間」相關資料來源，但後端目前尚未完成急診 table 欄位 mapping，因此暫時不能穩定整理即時數字。請先確認 `er_overview` view 是否建立，並確認欄位是否已加入 AI dataset catalog。
```

不要回答：

```text
相關圖表元件為 hackathon_component_9_er_overview，相關性評分為 0.8872。
```

---

## 實作順序

1. 用 pgAdmin 或 psql 連到外部 DB：`192.168.8.80:5433` / `dashboard`。
2. 確認 `public."hackathon_component_9_Emergency Room News_ready"` 的實際欄位名稱。
3. 在外部 DB 建立 `public.er_overview` view，把原始欄位轉成穩定的 snake_case 欄位。
4. 在 `datasetCatalog` 新增 `er_overview` 白名單。
5. 新增 `componentDatasetMappings`，把 `hackathon_component_9_er_overview` 對到 `er_overview`。
6. 修改 `/ai/chat/twai` input schema，允許前端傳 `component_context`。
7. 更建議新增 `get_component_chart_data` tool，直接復用 `/component/:id/chart` 背後的 model 邏輯。
8. 在後端 `ChatWithTWCC` 前做 chart data prefetch，把結果注入 system prompt。
9. 修改 system prompt，禁止輸出 component index、score、tool/API 名稱。
10. 保留原本 tool calling 流程，讓 AI 對未預查到的主題仍可使用 `search_dashboard_datasets`、`query_dashboard_dataset` 或 `get_component_chart_data`。

---

## 擴充方式

### 新增資料集

在 `dataset_tools.go` 的 `datasetCatalog` 加一筆：

```go
{
    Table:       "your_table_name",
    Title:       "資料集中文名稱",
    Description: "簡短描述",
    Columns:     []string{"col_a", "col_b", "col_c"},
    Metrics:     []string{"col_b", "col_c"},     // 數值欄位
    Dimensions:  []string{"col_a"},              // 分組欄位
    TimeColumn:  "col_a",
    Examples:    []string{"相關中文查詢詞", "另一個詞"},
},
```

### 後續可做（設計文件第二、三階段）

- 將 catalog 改存為資料庫資料表或 JSON 檔，不再 hard-code
- 對 catalog 建向量索引，讓 `search_dashboard_datasets` 改用語意比對
- 回答中標示資料來源與更新時間
- 設定每次最多 tool call 次數與 query timeout
