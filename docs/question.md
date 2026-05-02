請幫我修 AI chat 目前抓不到後台圖表資料的問題。

目前流程：
1. FE `Taipei-City-Dashboard-FE/src/store/chatStore.js`
   - `searchRelatedComponents()` 會 POST `/vector/component`
   - 找到相關 component，例如 `hackathon_component_9_er_overview`
   - `askTWCCAI()` 會 POST `/ai/chat/twai`
   - request 裡有 `component_context`

2. BE `Taipei-City-Dashboard-BE/app/controllers/ai.go`
   - `ChatWithTWCC()` 會呼叫 `injectComponentContext()`
   - `injectComponentContext()` 會呼叫 `tools.BuildDatasetContextFromComponents()`
   - 如果有資料，會把 `database context:` 注入 system prompt

3. BE `Taipei-City-Dashboard-BE/app/services/ai/tools/dataset_tools.go`
   - `BuildDatasetContextFromComponents()` 目前會呼叫 `FetchComponentChartData()`
   - `FetchComponentChartData()` 用 component index 去 `components` 表查 id
   - 再用 `models.GetComponentChartDataQuery(id, city)`
   - 再走 `models.GetTwoDimensionalData` / `GetThreeDimensionalData` / `GetTimeSeriesData` / `GetMapLegendData`
   - 這些 function 會用 `models.DBDashboard.Raw(queryString)` 查 dashboard DB

問題：
AI 還是回答：
「根據 chartStore 知識庫... 相關圖表元件為 hackathon_component_9_er_overview，相關性分數 0.8872」
代表 database context 沒有成功注入，AI 沒拿到 chart data。

請做以下修改：

A. FE `chatStore.js`
- `component_context` 目前只傳 index/name/city/score。
- 請加上 `id: item.id`。
- 不要把 index/score 放進 system prompt 給 AI 看。
- system prompt 請改成：
  - 圖表名稱只作為資料來源線索，不是最終答案
  - 若有 database context，必須根據 database context 回答
  - 若沒有 database context，不要說找不到 dataset，而是說圖表資料預抓失敗
  - 不要輸出 chartStore、component index、score、tool/API 名稱

B. BE `dataset_tools.go`
- `ComponentContextItem` struct 加 `ID int json:"id"`。
- `BuildDatasetContextFromComponents()` 不要靜默吞錯。
- 如果 `FetchComponentChartData()` 失敗，要用 `logs.FError` 印出：
  - component id
  - component index
  - city
  - error
- 如果 data 是空，也 log。
- `FetchComponentChartData()` 改成優先用 component ID 查，不要只靠 index 反查。
- 可以新增：
  `FetchComponentChartDataByID(ctx, componentID, city string)`
  或修改原 function 支援 ID。

C. BE `ai.go`
- `injectComponentContext()` 如果 `dataCtx == ""`，也應該注入一段明確 context：
  `database context: 圖表資料預抓失敗或沒有資料。`
  讓 AI 不要再自己說 datasetCatalog 找不到。
- 最好也 log：
  - component_context 數量
  - database context 是否成功注入

D. 不要重做整套 datasetCatalog。
這個 case 應該走既有 component chart data path：
`component id -> query_charts.query_chart -> DBDashboard.Raw(queryString)`。

請完成後列出修改檔案與主要改動。
