# 通用語言 (Ubiquitous Language) — CIVIC NEXUS 黑客松 2026

## 核心領域與組件 (Core Domains & Components)

| 術語 (原型/Prototype) | 實作目標 (黑客松規範) | 約束與規則 |
|:---:|:---:|---|
| **AI 洞察面板 (Insight Panel)** | `FE/src/components/custom/AIInsight.vue` | 必須經由 `/api/v1/ai/chat/twai` 呼叫。嚴禁前端直連 AI。 |
| **資料源 (Data Source)** | `BE/app/models/componentData.go` | 必須映射至：`two_d`, `percent`, `three_d`, `map_legend`, `time` 其中之一。 |
| **城市語境 (City Context)** | `Taipei` 或 `Metro-Taipei` | 所有 AI Tools 與 DE 查詢的必要參數。 |
| **圖表組件 (Chart Widget)** | `FE/src/components/charts/ApexChartWrapper.vue` | **僅限使用 ApexCharts**。禁用 ECharts/D3。 |
| **AI 工具 (AI Tool)** | `BE/app/services/ai/tools/{name}.go` | 必須回傳 llama3.3 可理解的結構化 JSON。 |
| **地圖圖層 (Map Layer)** | `FE/src/components/map/MapContainer.vue` | 使用 Mapbox GL JS 3.1。標準化 GeoJSON 格式。 |

## 資料結構契約 (Data Structure Contracts)

### 1. `two_d` (簡單序列)
- **原型**：標籤與數值的列表。
- **契約**：`{"x_axis": ["大安區", ...], "data": [10, 20, ...]}`

### 2. `three_d` (熱力圖 / 多序列)
- **原型**：矩陣或分組資料。
- **契約**：`{"x_axis": [...], "y_axis": [...], "data": [[...]]}`

## 流程術語

- **快速驗證 (Quick Validation)**：執行 `component-quick-validator` 檢查 API 與 HTML 可行性。
- **組件裝備 (Harnessing)**：將原型轉化為生產等級組件的 6+1 階段流程。
- **金絲雀檢查 (Canary)**：部署後的視覺與功能自動化驗收。
