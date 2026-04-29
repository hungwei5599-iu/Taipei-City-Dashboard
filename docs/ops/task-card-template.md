# Task Card Template

Use this template for every lane-owned task. Fill every field before work starts.

```md
# Task Card: <short title>

## Routing
- Primary owner:
- Supporting owner: none | <name>
- Lane: DE | BE | FE | integration | PM
- Source skill / intake source:
- Target scope: repo | theme | component | cross-cutting
- Validation state: unknown | quick-validated | ready-for-build | blocked
- Priority / deadline:

## Outcome
- Business outcome:
- Affected component or theme:
- Upstream dependency:
- Downstream consumer:

## Required Inputs
- Input 1:
- Input 2:
- Input 3:

## Artifact
- Artifact to produce:
- Output artifact path:
- Resource links:
  - <repo path or doc>
  - <repo path or doc>

## Execution Boundaries
- In scope:
- Out of scope:
- Do not duplicate:

## Done Criteria
- Criterion 1:
- Criterion 2:
- Criterion 3:

## Dependency Flow
- Dependency in:
- Dependency out:
- Handoff target:
- Handoff condition:

## Blocker Rule
- If blocked by:
- Then notify:
- Required handoff artifact:
```

## Notes

- `Primary owner` must be exactly one person.
- `Supporting owner` is optional.
- `Output artifact path` should point to a real file, folder, doc, PR, or validated deliverable.
- `Do not duplicate` should name adjacent lanes or owners who must not redo this slice.
- If the task crosses lanes, add a `handover` step when the artifact is ready.
