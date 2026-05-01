# File Placement Rules

Last updated: 2026-05-01

This file defines where agents and humans must put competition documentation and generated evidence.

## Canonical Active Paths

| Artifact type | Required path |
|---|---|
| Competition MVP entrypoint | `docs/3-Tracks/competition-mvp/README.md` |
| PM plan and story docs | `docs/3-Tracks/competition-mvp/plan/` |
| DE/BE/FE contracts | `docs/3-Tracks/competition-mvp/contracts/` |
| Per-person work specs | `docs/3-Tracks/competition-mvp/role-specs/` |
| Lane handoff docs | `docs/3-Tracks/competition-mvp/handoff/` |
| Acceptance and audit checklists | `docs/3-Tracks/competition-mvp/verification/` |
| Historical evidence | `docs/Archive/2026-hackathon-prep/` |
| Pre-hackathon tool source | `tools/pre-hackathon/` |

## Legacy Paths

These paths are read-only legacy sources unless a task explicitly says to archive or repair them:

- `docs/3-Tracks/prep_compoment/`
- `docs/hackathon/`
- `docs/Archive/Data-Source-Old/`
- `docs/Archive/General-Old/`

New specs, contracts, role cards, quick validation reports, and prototype HTML must not be written there.

## Generated Evidence Rules

- Quick validation Markdown goes to `docs/Archive/2026-hackathon-prep/validation-reports/`.
- Prototype HTML goes to `docs/Archive/2026-hackathon-prep/prototype-html/`.
- OMC/OMX/Gemini outputs stay in runtime folders and are only linked from `docs/Archive/2026-hackathon-prep/tool-artifacts-index.md`.
- Runtime logs, `.DS_Store`, `node_modules`, `venv`, `.venv`, and `.env` must not be stored under `docs/`.

## Active Document Rules

- Active docs must describe what to rebuild during the competition.
- Active docs must not present pre-race prototype code as competition code.
- Active docs must use absolute dates.
- Every role spec must include owner, artifact, input, output path, upstream dependency, downstream consumer, done criteria, and do-not-duplicate.
