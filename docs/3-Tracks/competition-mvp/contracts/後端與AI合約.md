# 後端與 AI 合約

最後更新：2026-05-01

Owner：張詠翔

## 規則

- AI 必須透過 Go 後端使用 `llama3.3-ffm-70b-16k-chat`。
- 前端必須呼叫 `/api/v1/ai/chat/twai`，不能直接呼叫任何 AI provider。
- 不可新增未核准的 `go get`。
- 回應必須保留 source trace 與資料新鮮度。
- 只能使用官方 fork 的競賽重建路徑，不得把賽前既有實作或舊原型程式碼搬進正式競賽倉庫。
- AI 出口只允許 TWCC proxy，不允許 OpenAI、Anthropic、Gemini 或其他外部 AI 直連。

## API 合約

| Endpoint | Query params | Response | Error cases |
|---|---|---|---|
| `GET /api/v1/hackathon/mvp/map` | `city_scope`，選填 `district` | GeoJSON-like 資料與 `source_trace` | 400 城市無效，500 資料庫錯誤，200 空資料但附說明 |
| `GET /api/v1/hackathon/mvp/trend` | `city_scope`，選填 `district`、`date_range` | `time` 圖表 payload | 400 日期範圍無效，500 資料庫錯誤，200 空資料 |
| `GET /api/v1/hackathon/mvp/compare` | `city_scope`、`metric_name` | `two_d` 或 `percent` payload | 400 指標無效，500 資料庫錯誤，200 空資料 |
| `POST /api/v1/ai/chat/twai` | 依所選元件情境組成的 chat payload | AI 洞察、風險、建議、副作用 | 429 rate limit、快取 fallback、500 provider error |

## AI 工具合約

工具名稱：`summarize_mvp_decision_context`

輸入：

```json
{
  "component_id": "mvp_map | mvp_trend | mvp_compare",
  "city_scope": "Taipei | Metro-Taipei",
  "district": "optional district name",
  "date_range": "optional date range",
  "data_hash": "hash of current DB/API snapshot"
}
```

輸出：

```json
{
  "insight": "Evidence-backed situation summary.",
  "risk_or_gap": "Risk or service gap grounded in current data.",
  "recommendation": "Actionable recommendation.",
  "side_effect": "Expected tradeoff or area affected by the recommendation.",
  "source_trace": ["official source or ready table references"],
  "data_mode": "real | real_with_normalization | fallback",
  "cache_key": "component_id + city_scope + district + date_range + data_hash"
}
```

## 完成條件

- FE 不需要讀 Go 程式碼就能消費 API 合約。
- AI 輸出帶有 source trace。
- cache key 是可預測且固定的。
- 空資料與 provider fallback 都有定義。
- 前端沒有 AI key 外洩風險。
