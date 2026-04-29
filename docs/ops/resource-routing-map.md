# Resource Routing Map

This map tells PM and lane owners where to send common request types and which repo assets to open first.

## Core routing table

| Request type | Default lane | Default owner | Skill / workflow | Start here |
| --- | --- | --- | --- | --- |
| Data feasibility, joinability, source ambiguity | PM -> DE validation | 羅浚 -> 賴泓瑋 | `component-quick-validator` or `data-assessment` | `docs/3-Tracks/prep_compoment/execute/component-specs.md`, `docs/3-Tracks/prep_compoment/review/validation-results.md`, `docs/3-Tracks/prep_compoment/plan/hackathon-dataset-registry.yaml` |
| Backend contract, query boundary, proxy/tool handler | BE | 張詠翔 | `agent-harness-construction` | `Taipei-City-Dashboard/Taipei-City-Dashboard-BE/app/services/ai/ai_service.go`, `Taipei-City-Dashboard/Taipei-City-Dashboard-BE/app/services/ai/tools/registry.go`, `Taipei-City-Dashboard/Taipei-City-Dashboard-BE/app/services/ai/tools/hackathon.go`, `Taipei-City-Dashboard/Taipei-City-Dashboard-BE/app/services/ai/providers/twcc/twcc.go` |
| Frontend component, chart, map, UI refinement | FE | 林鈞元 | `agent-harness-construction` | `Taipei-City-Dashboard/Taipei-City-Dashboard-FE/src/components/charts/HistoryChart.vue`, `Taipei-City-Dashboard/Taipei-City-Dashboard-FE/src/components/map/MapContainer.vue`, `docs/3-Tracks/prep_compoment/plan/design.md` |
| DE pipeline, ETL, schema mapping, refresh logic | DE | 賴泓瑋 | `agent-harness-construction` | `Taipei-City-Dashboard/Taipei-City-Dashboard-DE/dags/proj_city_dashboard/`, `docs/3-Tracks/prep_compoment/plan/de-handoff-spec.md`, `docs/3-Tracks/prep_compoment/review/quickval-source-health.json` |
| Integration issue, runtime drift, Docker, env, observability, demo stability | integration | 余振言 | `handover` + integration packet | `Taipei-City-Dashboard/docker/docker-compose.yaml`, `Taipei-City-Dashboard/docker/docker-compose-db.yaml`, `docs/3-Tracks/prep_compoment/plan/integration-test-plan.md`, `docs/3-Tracks/prep_compoment/ship/demo-script.md` |
| Judge prep, demo storyline, AI boundary, PR wedge | PM | 羅浚 | `score` | `docs/3-Tracks/prep_compoment/review/judge-qa.md`, `docs/3-Tracks/prep_compoment/ship/demo-script.md`, `docs/3-Tracks/prep_compoment/ship/pr-strategy.md`, `docs/3-Tracks/prep_compoment/plan/ai-boundary.md` |
| Team assignment, ownership clarification, blocked transfer | PM routing | 羅浚 | `pm-task-router` | `docs/ops/team-harness.md`, `docs/ops/task-card-template.md`, `.agents/skills/pm-task-router/SKILL.md` |

## Routing heuristics

### Send to validation first when:
- the data source is not trustworthy yet
- the key join fields are still unclear
- the request says "can we do this?" more than "build this"
- FE would otherwise be forced to invent contract assumptions

### Send to DE first when:
- the missing work is ETL, schema mapping, data cleaning, refresh schedule, or dataset registry alignment
- there is no stable queryable shape yet

### Send to BE first when:
- data exists but the UI lacks a usable contract
- new query logic, proxy logic, AI tool handler, or response shaping is required

### Send to FE first when:
- data and contract are already stable
- the remaining work is view-layer rendering, interaction, chart layout, or map behavior
- the request is a UI-only refinement and does not reopen data or contract questions

### Send to integration first when:
- multiple lanes are editing the local stack at once
- the problem mentions Docker, env, runtime, observability, or demo stability
- no single feature lane can fix the issue without coordinating the environment

## Example packets

### Example: unclear new component idea
- Route: PM -> `component-quick-validator`
- Primary owner: 羅浚
- Support owner: 賴泓瑋
- Do not duplicate: 林鈞元 does not start FE implementation yet

### Example: chart-ready dataset with no API shape yet
- Route: DE first, then optional BE
- Primary owner: 賴泓瑋
- Downstream consumer: 張詠翔
- Do not duplicate: FE does not hardcode mock contracts as final shape

### Example: local demo breaks after env drift
- Route: integration
- Primary owner: 余振言
- Support owner: original lane owner only if needed
- Do not duplicate: DE / BE / FE do not run separate infra fixes in parallel
