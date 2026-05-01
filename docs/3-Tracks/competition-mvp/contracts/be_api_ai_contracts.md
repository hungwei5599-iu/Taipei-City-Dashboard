# BE API and AI Contracts

Last updated: 2026-05-01

Owner: 張詠翔

## Rules

- AI must use `llama3.3-ffm-70b-16k-chat` through the Go backend.
- Frontend must call `/api/v1/ai/chat/twai`; it must not call AI providers directly.
- No unapproved `go get`.
- Responses must preserve source trace and data freshness.

## API Contracts

| Endpoint | Query params | Response | Error cases |
|---|---|---|---|
| `GET /api/v1/hackathon/mvp/map` | `city_scope`, optional `district` | GeoJSON-like data and `source_trace` | 400 invalid city, 500 DB error, 200 empty data with explanation |
| `GET /api/v1/hackathon/mvp/trend` | `city_scope`, optional `district`, `date_range` | `time` chart payload | 400 invalid date range, 500 DB error, 200 empty data |
| `GET /api/v1/hackathon/mvp/compare` | `city_scope`, `metric_name` | `two_d` or `percent` payload | 400 invalid metric, 500 DB error, 200 empty data |
| `POST /api/v1/ai/chat/twai` | chat payload with selected component context | AI insight, risk, recommendation, side effects | 429 rate limit, cached fallback, 500 provider error |

## AI Tool Contract

Tool name: `summarize_mvp_decision_context`

Input:

```json
{
  "component_id": "mvp_map | mvp_trend | mvp_compare",
  "city_scope": "Taipei | Metro-Taipei",
  "district": "optional district name",
  "date_range": "optional date range",
  "data_hash": "hash of current DB/API snapshot"
}
```

Output:

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

## Done Criteria

- API contracts can be consumed by FE without reading Go code.
- AI output has source trace.
- Cache key is deterministic.
- Empty data and provider fallback are defined.
- No frontend AI key exposure is possible.
