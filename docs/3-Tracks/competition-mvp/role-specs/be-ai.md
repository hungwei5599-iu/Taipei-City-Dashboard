# BE and AI Role Spec

Last updated: 2026-05-01

- Owner: 張詠翔
- Lane: BE / AI
- Artifact: API contract, query contract, AI tool schema, cache/fallback behavior
- Input: DE manifest and schema plan, existing Go backend patterns, TWCC AI boundary rules
- Output path: `docs/3-Tracks/competition-mvp/contracts/be_api_ai_contracts.md`
- Upstream dependency: DE ready table/view contract
- Downstream consumer: FE owner and integration owner
- Do-not-duplicate: DE cleaning logic, FE visual layout, PM story framing

## Inputs

- DE manifest and schema plan.
- Existing Go backend patterns.
- TWCC AI boundary rules.

## Work Contract

- Implement or document query behavior for map, trend, comparison, and AI context.
- Keep all AI traffic behind `/api/v1/ai/chat/twai`.
- Add deterministic cache key: `component_id + city_scope + district + date_range + data_hash`.
- Return source trace and fallback state.

## Done Criteria

- FE can consume API responses without reading DB schema.
- AI tool output is structured and evidence-backed.
- Invalid city, empty data, DB error, provider error, and rate limit cases are defined.
- No unapproved Go package is required.
