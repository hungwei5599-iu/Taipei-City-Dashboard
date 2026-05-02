# TWCC Prompt Candidate Ranking

Generated at: 2026-05-02T22:56:04
Model: `llama3.3-ffm-70b-16k-chat`
Calls: 6 success / 0 errors / 6 total
Recommended candidate: `strict_json_data_first_v2`
Production gate: PASS

## Ranking

| Rank | Candidate | Avg score | JSON valid | Module recall | Safety recall | Guardrail pass | DB context pass | p50 latency | Avg tokens |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `strict_json_data_first_v2` | 1.0000 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 4781 ms | 1426.17 |

## Integration Recommendation

- strict_json_data_first_v2 passed the production gate and is BE-ready as the prompt baseline. Integrate through the existing BE orchestrator path, not a new AI gateway.
- Failed thresholds: none

## Per-Case Failures

- None

## Notes

- The report intentionally excludes `X-API-KEY` and any `.env` secret values.
- Scores use deterministic validators for JSON shape, module recall/precision, safety flag recall, answer guardrails, and database-context use.
- Latency and token counts are tie-breakers, not primary safety gates.
