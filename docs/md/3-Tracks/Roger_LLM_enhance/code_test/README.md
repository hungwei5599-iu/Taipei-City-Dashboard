# Five-Component User Guide Code Test

This folder is a dependency-free prototype/test package for the food-health user guide flow.
It does not modify the production FE/BE code.

## Scope

The target guide components are the five `hackathon_food_health` components from the pulled
`zhenyan2` branch:

- `hackathon_component_2_food_safety_overview`: food inspection pass rate
- `hackathon_component_7_pharmacy_overview`: pharmacy resource distribution
- `hackathon_component_9_er_overview`: ER waiting count and time
- `hackathon_component_10_water_quality_overview`: water quality monitoring
- `hackathon_c11_env_restaurant_overview`: eco restaurant distribution

The integration target is the current BE/FE contract:

- Request: `POST /ai/chat/twai`
- The request may include `component_context`
- Each component context item must include numeric `id`
- Response content is read from `data.content`
- User-facing answers must not expose component index, score, tool names, API names, or chartStore internals

## Run

```bash
cd /Users/ro9air/projects/Taipei_Dashdorad/ai_test_specs/LLM_enhance/code_test
python3 run_tests.py
```

The runner writes:

```text
reports/assessment_report.md
```

## Live TWCC Prompt Eval

The live runner reads TWCC settings from `/Users/ro9air/projects/Taipei_Dashdorad/.env`.
It reports key presence only and never prints or persists the API key.

```bash
python3 twcc_prompt_eval.py --dry-run
python3 twcc_prompt_eval.py --live-twcc --enforce-thresholds
```

The current production-gate candidate is `strict_json_data_first_v2`.
Latest passing evidence:

```text
reports/twcc_eval/20260502-225718/
reports/production_readiness_report.md
```

Production thresholds:

- TWCC success rate: 1.00
- JSON valid rate: 1.00
- module recall: 1.00
- guardrail pass rate: 1.00
- database context pass rate: 1.00
- safety flag recall: >= 0.95

## Optional Local Smoke

If a local backend is running, this command tries the live component/vector/chat endpoints.
It skips cleanly when the local service is unavailable.

```bash
LOCAL_API_BASE=http://127.0.0.1:8080/api/v1 python3 run_tests.py --live-local
```
