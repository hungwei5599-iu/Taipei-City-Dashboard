# AI Guide Prompt Eval Report

Updated: 2026-05-02

## Latest Production Gate

Report directory:

```text
/Users/ro9air/projects/Taipei_Dashdorad/ai_test_specs/LLM_enhance/code_test/reports/twcc_eval/20260502-225718
```

Result:

- Model: `llama3.3-ffm-70b-16k-chat`
- Calls: 24 success / 0 errors / 24 total
- Recommended candidate: `strict_json_data_first_v2`
- Production gate: PASS
- Failed thresholds: none

Ranking:

| Rank | Candidate | Avg score | JSON valid | Module recall | Safety recall | Guardrail pass | DB context pass |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | `strict_json_data_first_v2` | 1.0000 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| 2 | `strict_json_data_first_v1` | 0.8925 | 1.00 | 1.00 | 0.28 | 1.00 | 1.00 |
| 3 | `concise_user_guide_v1` | 0.4500 | 1.00 | 0.00 | 0.00 | 1.00 | 1.00 |
| 4 | `policy_guardrail_v1` | 0.0000 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## Rerun Commands

```bash
cd /Users/ro9air/projects/Taipei_Dashdorad/ai_test_specs/LLM_enhance/code_test
python3 run_tests.py
python3 twcc_prompt_eval.py --dry-run
python3 twcc_prompt_eval.py --live-twcc --enforce-thresholds
```

Targeted v2 rerun:

```bash
python3 twcc_prompt_eval.py --live-twcc --enforce-thresholds --candidate strict_json_data_first_v2
```

## Interpretation

`strict_json_data_first_v2` is BE-ready as the prompt baseline. The key production-readiness change from v1 is explicit safety flag enumeration in the structured `safety_flags` field.

BE should still implement deterministic validation after TWCC output. Prompt compliance is evidence, not a security boundary.
