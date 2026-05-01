# Competition MVP Track

Last updated: 2026-05-01

This is the canonical documentation entry for the Taipei Dashdorad competition rebuild strategy.

The goal is a clean 4-component MVP that can be rebuilt during the competition from the official fork with transparent commits. Existing code, validation HTML, quick validation reports, and Gemini/OMC/OMX outputs are evidence only. They are not source material to copy into the competition repository.

## Strategy

- Build from the official fork during the competition.
- Use pre-race work only as specs, contracts, schemas, tests, and demo scripts.
- Commit verifiable units, not artificial time slices.
- Keep AI removable: the dashboard must still explain the decision without the AI card.
- Keep every lane owned by exactly one DRI.

## Four MVP Components

| Component | Purpose | Primary owner | Data format |
|---|---|---|---|
| Metro situation map | Mapbox spatial distribution, hotspots, and district differences | FE, after DE/BE handoff | `map_legend` / GeoJSON payload |
| Trend and anomaly chart | Time series or percentage movement showing whether conditions are worsening | FE, after BE contract | `time` |
| Taipei vs Metro comparison card | Ranking, density, gap, or service coverage comparison | FE, after DE/BE handoff | `two_d` or `percent` |
| AI decision summary card | Evidence-backed insight, risk, recommendation, and side effect | BE/AI with FE consumer | Structured tool output |

## Read First

1. [File placement rules](./00_file_placement_rules.md)
2. [PM strategy](./plan/pm_strategy.md)
3. [DE dataset manifest](./contracts/de_dataset_manifest.yaml)
4. [BE API and AI contracts](./contracts/be_api_ai_contracts.md)
5. [FE component contracts](./contracts/fe_component_contracts.md)
6. [Handoff matrix](./handoff/handoff_matrix.md)
7. [Compliance checklist](./verification/compliance_checklist.md)

## Legacy Evidence

Historical quick validation reports, prototype HTML, old 10-component plans, and runtime artifacts live under:

- `docs/Archive/2026-hackathon-prep/`

Do not add new active instructions to `docs/3-Tracks/prep_compoment/` or `docs/hackathon/`.
