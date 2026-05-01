# Integration Role Spec

Last updated: 2026-05-01

- Owner: 余振言
- Lane: integration / platform
- Artifact: local-stack verification, git audit, demo smoke evidence
- Input: official fork branch state, lane completion evidence, demo script and compliance checklist
- Output path: `docs/3-Tracks/competition-mvp/verification/`
- Upstream dependency: DE, BE, and FE artifacts
- Downstream consumer: PM final signoff
- Do-not-duplicate: feature-lane implementation unless explicitly handed off

## Inputs

- Official fork branch state.
- DE/BE/FE completion evidence.
- Demo script and compliance checklist.

## Work Contract

- Verify local stack can run the demo path.
- Check no secrets, `.env`, `node_modules`, `venv`, or `.venv` are committed.
- Check no unapproved package changes are staged.
- Confirm commit history reflects real verifiable units.

## Done Criteria

- Demo smoke checklist passes.
- Git audit checklist passes.
- Remaining risks are written with owner and next action.
