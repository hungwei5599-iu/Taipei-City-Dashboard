# FE Component Contracts

Last updated: 2026-05-01

Owner: 林鈞元

## Rules

- Charts use ApexCharts only.
- Maps use Mapbox GL.
- Every component has a Taipei / Metro-Taipei switch.
- Every component has loading, empty, and error states.
- The dashboard must work without the AI decision card.

## Components

| Component | Inputs | Visual | Required behavior |
|---|---|---|---|
| Metro situation map | `GET /api/v1/hackathon/mvp/map` | Mapbox symbol/circle/choropleth layer | City switch changes points, legend, and explanatory text |
| Trend and anomaly chart | `GET /api/v1/hackathon/mvp/trend` | ApexCharts line or heatmap | Date range and city switch update series |
| Taipei vs Metro comparison card | `GET /api/v1/hackathon/mvp/compare` | ApexCharts bar, percent, or compact KPI list | Same metric definition across city scopes |
| AI decision summary card | `POST /api/v1/ai/chat/twai` | Structured text card | Shows source trace and fallback state; never blocks base charts |

## Empty-State Copy Contract

- Empty data: "此篩選條件下沒有可用資料，請切換城市或日期。"
- Fallback data: "此區塊使用已標示的 fallback 資料，不宣稱為即時官方讀值。"
- AI unavailable: "AI 摘要暫不可用，以下圖表仍為官方資料查詢結果。"

## Done Criteria

- No ECharts, Chart.js, D3, Recharts, or Highcharts imports.
- No direct AI API call from FE.
- City switch changes data and visible copy.
- The demo path is readable on a projected dashboard screen.
