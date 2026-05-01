# PM Strategy

Last updated: 2026-05-01

Owner: 羅浚

## Objective

Turn pre-race assets into competition-safe specs and tests so the team can rebuild a 4-component MVP from the official fork with a traceable commit history.

## Business Outcome

The demo proves a reusable dual-city decision dashboard:

- One map answers where action is needed.
- One trend or anomaly chart answers whether conditions are worsening.
- One comparison card answers how Taipei differs from Metro Taipei.
- One AI decision card explains evidence, risk, recommendation, and side effects.

## In Scope

- Scenario matrix for six possible official themes.
- Dataset priority and fallback decisions.
- Judge story and demo script.
- Final compliance review.
- Scope arbitration when DE/BE/FE contracts conflict.

## Out of Scope

- Writing ETL code.
- Writing Go handlers.
- Writing Vue components.
- Copying pre-race implementation code into the official fork.

## Required Artifact

- `docs/3-Tracks/competition-mvp/plan/scenario_matrix.md`
- `docs/3-Tracks/competition-mvp/plan/demo_narrative.md`
- Final PM signoff in `docs/3-Tracks/competition-mvp/verification/compliance_checklist.md`

## Done Criteria

- The team can explain why the selected theme is a public decision problem.
- Each MVP component has a decision question and a data source.
- Every component remains useful without AI.
- The demo can be delivered from the dashboard screen without slides.
- No one needs old chat history to understand the rebuild plan.
