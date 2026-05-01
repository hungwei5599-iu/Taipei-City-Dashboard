# FE Role Spec

Last updated: 2026-05-01

- Owner: 林鈞元
- Lane: FE
- Artifact: Vue component contract and dashboard demo surface
- Input: BE API and AI contracts, existing Vue/ApexCharts/Mapbox patterns, PM demo narrative
- Output path: `docs/3-Tracks/competition-mvp/contracts/fe_component_contracts.md`
- Upstream dependency: BE API contract
- Downstream consumer: integration owner and PM demo reviewer
- Do-not-duplicate: DE source cleaning, BE query logic, AI provider integration

## Inputs

- BE API and AI contracts.
- Existing Vue, ApexCharts, and Mapbox patterns.
- PM demo narrative.

## Work Contract

- Render four components with city switch.
- Use ApexCharts for charts and Mapbox for spatial layers.
- Show source/fallback state in the UI.
- Keep the core dashboard useful without AI.

## Done Criteria

- Four components render from API-shaped data.
- City switching changes data and copy.
- AI unavailable state does not break the dashboard.
- No banned chart library or frontend AI provider call is introduced.
