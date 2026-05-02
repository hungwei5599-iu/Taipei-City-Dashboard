# TWCC Prompt Candidate Ranking

Generated at: 2026-05-02T22:59:47
Model: `llama3.3-ffm-70b-16k-chat`
Calls: 24 success / 0 errors / 24 total
Recommended candidate: `strict_json_data_first_v2`
Production gate: PASS

## Ranking

| Rank | Candidate | Avg score | JSON valid | Module recall | Safety recall | Guardrail pass | DB context pass | p50 latency | Avg tokens |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `strict_json_data_first_v2` | 1.0000 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 4661 ms | 1426.17 |
| 2 | `strict_json_data_first_v1` | 0.8925 | 1.00 | 1.00 | 0.28 | 1.00 | 1.00 | 4627 ms | 1194.50 |
| 3 | `concise_user_guide_v1` | 0.4500 | 1.00 | 0.00 | 0.00 | 1.00 | 1.00 | 3191 ms | 956.00 |
| 4 | `policy_guardrail_v1` | 0.0000 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 | 10374 ms | 1493.00 |

## Integration Recommendation

- strict_json_data_first_v2 passed the production gate and is BE-ready as the prompt baseline. Integrate through the existing BE orchestrator path, not a new AI gateway.
- Failed thresholds: none

## Per-Case Failures

- `strict_json_data_first_v1` / `food_inspection_news_001`: safety_recall=0.5
- `strict_json_data_first_v1` / `pharmacy_access_001`: safety_recall=0.0
- `strict_json_data_first_v1` / `er_waiting_001`: safety_recall=0.0
- `strict_json_data_first_v1` / `water_quality_001`: safety_recall=0.5
- `strict_json_data_first_v1` / `eco_restaurant_001`: safety_recall=0.5
- `strict_json_data_first_v1` / `food_health_multi_001`: safety_recall=0.2
- `policy_guardrail_v1` / `food_inspection_news_001`: json=['BAD_TYPE_USED_DATABASE_CONTEXT', 'BAD_TYPE_LIMITATIONS']; module_recall=0.0; safety_recall=0.0; database_context=failed
- `policy_guardrail_v1` / `pharmacy_access_001`: json=['BAD_TYPE_USED_DATABASE_CONTEXT', 'BAD_TYPE_LIMITATIONS']; module_recall=0.0; safety_recall=0.0; database_context=failed
- `policy_guardrail_v1` / `er_waiting_001`: json=['BAD_TYPE_USED_DATABASE_CONTEXT', 'BAD_TYPE_LIMITATIONS']; module_recall=0.0; safety_recall=0.0; database_context=failed
- `policy_guardrail_v1` / `water_quality_001`: json=['BAD_TYPE_USED_DATABASE_CONTEXT', 'BAD_TYPE_LIMITATIONS']; module_recall=0.0; safety_recall=0.0; database_context=failed
- `policy_guardrail_v1` / `eco_restaurant_001`: json=['BAD_TYPE_USED_DATABASE_CONTEXT', 'BAD_TYPE_LIMITATIONS']; module_recall=0.0; safety_recall=0.0; database_context=failed
- `policy_guardrail_v1` / `food_health_multi_001`: json=['BAD_TYPE_USED_DATABASE_CONTEXT', 'BAD_TYPE_LIMITATIONS']; module_recall=0.0; safety_recall=0.0; database_context=failed
- `concise_user_guide_v1` / `food_inspection_news_001`: module_recall=0.0; safety_recall=0.0
- `concise_user_guide_v1` / `pharmacy_access_001`: module_recall=0.0; safety_recall=0.0
- `concise_user_guide_v1` / `er_waiting_001`: module_recall=0.0; safety_recall=0.0
- `concise_user_guide_v1` / `water_quality_001`: module_recall=0.0; safety_recall=0.0
- `concise_user_guide_v1` / `eco_restaurant_001`: module_recall=0.0; safety_recall=0.0
- `concise_user_guide_v1` / `food_health_multi_001`: module_recall=0.0; safety_recall=0.0

## Notes

- The report intentionally excludes `X-API-KEY` and any `.env` secret values.
- Scores use deterministic validators for JSON shape, module recall/precision, safety flag recall, answer guardrails, and database-context use.
- Latency and token counts are tie-breakers, not primary safety gates.
