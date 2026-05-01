# DE Role Spec

Last updated: 2026-05-01

- Owner: 賴泓瑋
- Lane: DE
- Artifact: dataset manifest, ready table/view contract, quality checks
- Input: official source URLs, PM scenario matrix, archive evidence
- Output path: `docs/3-Tracks/competition-mvp/contracts/de_dataset_manifest.yaml`
- Upstream dependency: PM scenario selection and source priority
- Downstream consumer: BE/AI owner
- Do-not-duplicate: BE API shaping, FE rendering, integration runtime fixes

## Inputs

- Official open-data source URLs.
- `docs/3-Tracks/competition-mvp/plan/scenario_matrix.md`
- Historical evidence under `docs/Archive/2026-hackathon-prep/`

## Work Contract

- Define source URL, license/source owner, key fields, update cadence, and fallback mode.
- Produce ready table/view schemas using only approved data shapes.
- Add `source_trace`, `data_mode`, `last_validated_at`, and `lasttime_in_data`.
- Document row count, city coverage, coordinate or district join validation.

## Done Criteria

- BE can query each ready table/view without asking for field meanings.
- Taipei and Metro-Taipei scopes are both represented or explicitly explained.
- Every derived field has a written rule.
- No ETL code from pre-race work is copied as competition code.
