# Handoff Matrix

Last updated: 2026-05-01

| From | To | Artifact | Handoff condition | Do not duplicate |
|---|---|---|---|---|
| PM | DE | Scenario and source priority | Theme selected and decision question written | DE does not redefine the public problem |
| DE | BE/AI | Dataset manifest and ready table/view schema | Quality checks documented and field meanings fixed | BE does not rebuild cleaning logic |
| BE/AI | FE | API and AI response contract | Endpoint params, response shapes, and errors documented | FE does not infer hidden API shapes |
| FE | Integration | Demo-ready dashboard behavior | Components render, city switch works, fallback states visible | Integration does not rewrite feature code |
| Integration | PM | Smoke, git audit, compliance results | Local demo and audit checks completed | PM does not rerun lane-local implementation |

## Minimum Handoff Message

- Completed artifact:
- Known gap:
- Next owner:
- What not to redo:
- Evidence path:
