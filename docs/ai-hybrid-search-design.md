# AI Hybrid Search 與資料庫 Tool 設計草稿

> 這份文件是可修改的設計稿，用來描述 `chartStore` 如何接台智雲 AI，並讓 AI 在回答問題時同時使用「向量查詢」與「資料庫查詢」。

## 目標

目前前端 `chatStore` 會先用 `/vector/component` 查詢 chartStore/Qdrant，找出語意相近的圖表元件。下一步希望 AI 不只推薦圖表，也能在使用者問到明確數字、年份、統計值時，透過後端工具查詢資料庫後回答。

核心目標：

- 使用者用自然語言提問。
- 系統先做向量查詢，找出相關圖表與資料集脈絡。
- AI 判斷問題是否需要查資料庫。
- AI 若需要資料庫，透過受控 tool 查詢，而不是直接自由執行 SQL。
- Go 後端負責白名單檢查、SQL 組裝與資料庫查詢。

## 整體流程

```text
User question
  |
  v
FE chatStore.addQueryData()
  |
  +--> POST /vector/component
  |      |
  |      v
  |    Qdrant / chartStore semantic search
  |      |
  |      v
  |    related chart context
  |
  +--> POST /ai/chat/twai
         |
         v
       TWCC AI
         |
         +--> plain answer from chart context
         |
         +--> tool call required
                |
                v
              Go backend tool registry
                |
                +--> search_dashboard_datasets
                |
                +--> query_dashboard_dataset
                         |
                         v
                       PostgreSQL
```

## 為什麼不要讓 AI 直接寫 SQL

AI 可以協助判斷「要查什麼」，但不應該直接拿模型產生的任意 SQL 去打資料庫。

風險：

- SQL injection。
- 查到不該公開的資料表。
- 執行過重查詢，拖慢資料庫。
- 模型產生錯誤 SQL，造成回答不穩。
- 難以控管欄位、聚合方式與資料權限。

因此建議採用「AI tool calling + 後端受控查詢」：

- AI 選 tool 與參數。
- Go 後端檢查 table、column、filter 是否在白名單。
- Go 後端組 SQL。
- Go 後端限制查詢類型只允許唯讀 `SELECT`。

## 建議新增的兩個通用 Tool

### 1. search_dashboard_datasets

用途：根據使用者問題，搜尋可能相關的資料表。

AI 呼叫範例：

```json
{
  "query": "台北市去年的出生人數"
}
```

後端回傳範例：

```json
{
  "datasets": [
    {
      "table": "birth_count_by_district",
      "title": "各行政區出生人數",
      "description": "依年份與行政區統計出生人數",
      "columns": ["year", "district", "birth_count"],
      "time_column": "year",
      "score": 0.91
    }
  ]
}
```

### 2. query_dashboard_dataset

用途：查詢白名單資料表中的指定欄位。

AI 呼叫範例：

```json
{
  "table": "birth_count_by_district",
  "metrics": ["birth_count"],
  "filters": {
    "city": "taipei",
    "year": 2025
  },
  "group_by": [],
  "limit": 50
}
```

後端回傳範例：

```json
{
  "table": "birth_count_by_district",
  "rows": [
    {
      "year": 2025,
      "birth_count": 12345
    }
  ],
  "source": "dashboard database"
}
```

## Dataset Catalog 設計

可以先用 Go map 寫死，之後再改成資料表或 JSON 檔。

範例：

```go
type DatasetCatalogItem struct {
    Table       string
    Title       string
    Description string
    Columns     []string
    Metrics     []string
    Dimensions  []string
    TimeColumn  string
    Examples    []string
}
```

範例資料：

```go
var datasetCatalog = []DatasetCatalogItem{
    {
        Table:       "population_age_distribution_tpe",
        Title:       "台北市人口年齡結構",
        Description: "依年份統計幼年、工作年齡與老年人口",
        Columns:     []string{"year", "young_population", "working_age_population", "elderly_population", "data_time"},
        Metrics:     []string{"young_population", "working_age_population", "elderly_population"},
        Dimensions:  []string{"year"},
        TimeColumn:  "year",
        Examples:    []string{"台北市 2024 年人口結構", "台北市去年老年人口"},
    },
}
```

## 後端安全規則

`query_dashboard_dataset` 必須做以下檢查：

- `table` 必須存在於 dataset catalog。
- `metrics` 必須全部存在於該 table 的白名單欄位。
- `group_by` 必須全部存在於該 table 的白名單欄位。
- `filters` 的 key 必須存在於該 table 的白名單欄位。
- `limit` 必須有上限，例如最大 100。
- 只允許 SELECT。
- 不接受 AI 傳入 raw SQL。
- 錯誤時回傳可讀訊息，讓 AI 能向使用者說明資料不足或參數不支援。

## 前端 chatStore 角色

前端不直接接台智雲 API，也不持有 API key。

`chatStore` 負責：

- 收到使用者問題。
- 呼叫 `/vector/component` 做 chartStore 語意檢索。
- 將檢索結果整理成 `chartStore context`。
- 呼叫 `/ai/chat/twai`。
- 傳入可用 tools schema。
- 顯示 AI 回答與推薦圖表。

## 後端 AI Service 角色

後端目前已有：

- `controllers.ChatWithTWCC`
- `services/ai/ai_service.go`
- `services/ai/providers/twcc`
- `services/ai/tools/registry.go`

後端負責：

- 代管 TWCC API key。
- 將 FE 傳來的 messages/tools 轉給台智雲 AI。
- 接收 AI tool call。
- 在 `tools.Execute` 中執行已註冊工具。
- 把 tool result 再送回 AI 生成最終回答。
- 紀錄 AI chat log。

## 實作 TODO

### 第一階段：先做可用版本

- [ ] 在 `registry.go` 新增 `search_dashboard_datasets`。
- [ ] 在 `registry.go` 新增 `query_dashboard_dataset`。
- [ ] 先用 Go map 建立 dataset catalog。
- [ ] 支援基本 filters：`year`、`city`、`district`。
- [ ] 支援基本 aggregation：`sum`、`avg`、`count`。
- [ ] 限制 `limit <= 100`。
- [ ] 前端 `chatStore.js` 將兩個新 tools 加入 `databaseTools`。

### 第二階段：讓資料表搜尋更準

- [ ] 將 dataset catalog 寫入資料庫或 JSON。
- [ ] 對 dataset title、description、columns 建向量索引。
- [ ] `search_dashboard_datasets` 使用向量查詢或關鍵字 + 向量混合排序。
- [ ] 回傳欄位語意說明，讓 AI 更容易組 query tool 參數。

### 第三階段：回答品質與治理

- [ ] 回答中標示資料來源與更新時間。
- [ ] 對每次 tool call 記錄 table、columns、filters。
- [ ] 設定敏感資料表不可查。
- [ ] 設定每次最多 tool call 次數。
- [ ] 加入查詢 timeout。

## 使用者問題範例

### 圖表推薦型

使用者：

```text
我想看交通相關的趨勢
```

預期：

- 向量查詢找交通相關圖表。
- AI 根據 chartStore context 推薦可看的元件。
- 不一定需要查 DB。

### 結構化資料型

使用者：

```text
台北市去年的出生人數是多少？
```

預期：

- 向量查詢仍會先找相關圖表。
- AI 判斷需要明確數字。
- AI 呼叫 `search_dashboard_datasets` 找出生人數資料表。
- AI 呼叫 `query_dashboard_dataset` 查指定年份。
- AI 用 tool result 回答。

### 混合型

使用者：

```text
台北市近五年出生人數趨勢如何？有沒有相關圖表可以看？
```

預期：

- 向量查詢找出生、人口、社會相關圖表。
- DB tool 查近五年出生人數。
- AI 同時回答趨勢與推薦圖表。

## 建議給 AI 的 System Prompt 摘要

```text
你是台北城市儀表板資料助理，回答請使用繁體中文。
系統已先完成 chartStore 向量查詢，請將 chart context 視為可推薦的圖表知識庫。
若問題是在找主題、趨勢或可視化，優先根據 chart context 回答。
若問題需要明確數字、年份、排名、統計摘要，請使用工具查詢資料庫。
你不能捏造資料庫沒有回傳的數字。
你不能產生 raw SQL，只能使用提供的工具。
若資料表或欄位不足以回答，請說明目前可查詢範圍。
```

