# BE / AI Role Spec: Five-Component Food-Health Guide

Updated: 2026-05-02

## Role Boundary

BE owns the AI guide orchestrator. TWCC is only the model provider. The LLM must not become an autonomous agent that chooses arbitrary data paths.

Required architecture:

```text
FE component_context
-> BE chart prefetch
-> database context injection
-> TWCC llama3.3-ffm-70b-16k-chat
-> BE JSON parse and guardrail validation
-> response + ai_chatlog
```

## BE Responsibilities

- Keep `/api/v1/ai/chat/twai` as the only frontend-facing AI endpoint.
- Use TWCC `llama3.3-ffm-70b-16k-chat` through the existing Go provider.
- Use `component_context.id` as the primary way to prefetch chart data.
- Inject database context before the TWCC call.
- Parse guide-mode model JSON before exposing user-facing content.
- Validate no-leak terms, safety flags, database-context use, and unsafe health claims.
- Record latency, token usage, status, tool usage, and errors in `ai_chatlog`.

## Prompt Ownership

Current BE-ready prompt baseline:

```text
strict_json_data_first_v2
```

Source fixture:

```text
ai_test_specs/LLM_enhance/code_test/fixtures/prompt_candidates.json
```

Do not replace this prompt with a shorter prompt unless it passes the same production gate. The shorter `concise_user_guide_v1` was faster, but failed module recall and safety flag recall.

## Guardrail Validator Ownership

BE should implement deterministic validation equivalent to the `code_test` runner:

- JSON object is parseable.
- Required fields exist and have correct types.
- `selected_module_ids` uses only allowed module IDs.
- `safety_flags` includes all expected flags for selected modules.
- `answer` has no internal identifiers or endpoint names.
- `answer` does not provide diagnosis, medication advice, fastest-hospital guarantees, single-store safety verdicts, or household water-safety verdicts.
- If database context has chart data, `answer` summarizes the data.
- If chart data is missing, `answer` says `圖表資料預抓失敗`.

If validation fails, BE should return a safe fallback answer and log the violations for eval.

## ai_chatlog Monitoring

Existing useful fields:

- `provider`
- `model`
- `question`
- `answer`
- `tool_used`
- `tools`
- `input_tokens`
- `output_tokens`
- `total_tokens`
- `latency_ms`
- `status`
- `error_code`
- `error_message`

Recommended next BE decision:

- Store guide metadata in `tools` JSONB or a future metadata column: `selected_module_ids`, `safety_flags`, `guardrail_violations`, `used_database_context`, `prompt_candidate_id`, `production_gate_version`.

## Remaining BE Work

- Confirm all five component IDs exist in the local manager DB and have valid `query_charts`.
- Add Go tests around component-context prefetch success and prefetch-failure wording.
- Add Go tests for model-output validator using captured raw TWCC JSON from `reports/twcc_eval/20260502-225718/raw_results.json`.
- Decide whether guide mode is non-streaming only for v1, or whether streaming should emit a final validated JSON event.
