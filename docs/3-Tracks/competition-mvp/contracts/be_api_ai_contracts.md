# BE API / AI Contract: Five-Component Food-Health Guide

Updated: 2026-05-02

## Integration Target

Use the existing BE AI endpoint:

```http
POST /api/v1/ai/chat/twai
```

Do not add a parallel AI gateway. Frontend must not call TWCC directly.

## Request Contract

Guide requests should include normal chat fields plus `component_context`:

```json
{
  "session": "session_food_health_001",
  "stream": false,
  "messages": [
    {
      "role": "system",
      "content": "你是雙北城市儀表板的食安健康導覽員..."
    },
    {
      "role": "user",
      "content": "我想看食品抽驗、藥局和急診等候狀況"
    }
  ],
  "component_context": [
    {
      "id": 2,
      "index": "hackathon_component_2_food_safety_overview",
      "name": "食品抽驗合格率",
      "city": "metrotaipei",
      "score": 0.91
    }
  ],
  "temperature": 0.2,
  "top_p": 0.8,
  "top_k": 40,
  "max_new_tokens": 700,
  "seed": 42
}
```

`component_context.id` is required for the preferred chart prefetch path. `index` and `score` may exist in the request payload, but must not appear in user-facing answers.

## Response Contract

Existing public response fields remain:

```json
{
  "status": "success",
  "data": {
    "session": "session_food_health_001",
    "content": "使用者可讀回答",
    "usage": {
      "input_tokens": 0,
      "output_tokens": 0,
      "total_tokens": 0
    },
    "tool_used": false,
    "latency_ms": 0,
    "model": "llama3.3-ffm-70b-16k-chat",
    "provider": "twcc"
  }
}
```

The prompt-eval JSON contract for guide-mode model output is:

```json
{
  "answer": "面向使用者的繁體中文回答",
  "selected_module_ids": ["food_inspection"],
  "safety_flags": ["official_data_only", "no_single_store_verdict"],
  "used_database_context": true,
  "limitations": ["限制說明"]
}
```

BE may keep returning only `data.content` in the public API for now, but production guide mode should parse the JSON internally so guardrail and analytics can inspect `selected_module_ids`, `safety_flags`, `used_database_context`, and `limitations`.

## Database Context Path

For these five components, chart questions should use component chart prefetch:

```text
component_context.id
-> query_charts lookup
-> component chart data query
-> database context injection
-> TWCC answer writer
```

`datasetCatalog` / `search_dashboard_datasets` is not the primary path for these chart questions.

If chart prefetch fails, the answer must say `圖表資料預抓失敗`, not `找不到資料集`.

## Safety Flags

Production prompt baseline: `strict_json_data_first_v2`.

Required module-to-flag mapping:

| Module | Required flags |
| --- | --- |
| `food_inspection` | `official_data_only`, `no_single_store_verdict` |
| `pharmacy_access` | `no_medication_advice` |
| `medical_access` | `no_medical_diagnosis`, `no_fastest_hospital_guarantee` |
| `water_quality` | `official_data_only`, `no_household_safety_claim` |
| `eco_restaurant` | `official_data_only`, `no_single_store_verdict` |

Multi-intent questions must merge all applicable flags.

## User-Facing No-Leak Terms

Answers must not expose:

```text
hackathon_
component index
component_id
score
chartStore
tool
API
datasetCatalog
query_dashboard_dataset
search_dashboard_datasets
/ai/chat
/component/
/models/conversation
```

## Production Gate

Before BE integration, run:

```bash
cd /Users/ro9air/projects/Taipei_Dashdorad/ai_test_specs/LLM_enhance/code_test
python3 run_tests.py
python3 twcc_prompt_eval.py --live-twcc --enforce-thresholds
```

Required live gate:

- TWCC success rate: 1.00
- JSON valid rate: 1.00
- Average module recall: 1.00
- Guardrail pass rate: 1.00
- Database context pass rate: 1.00
- Average safety flag recall: >= 0.95

Latest evidence: `reports/twcc_eval/20260502-225718/`, production gate PASS.
