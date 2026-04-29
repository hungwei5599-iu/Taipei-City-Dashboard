# Team Harness

## Summary

This document is the repo-wide operating layer for Taipei Dashdorad. It converts raw requests into lane-owned task packets so the team can move fast without duplicate work.

Operating model:
- Scope: whole repo, optimized for hackathon delivery
- Backlog shape: lane-first, component-aware
- Default rule: one task, one DRI
- Start rule: no work starts without an artifact target and done criteria

## Role Map

| Member | Primary role | Core ownership |
| --- | --- | --- |
| 羅浚 | PM / escalation owner | prioritization, quick-validation gate, story/demo coherence, scope arbitration |
| 賴泓瑋 | DE owner | dataset intake, ETL, schema mapping, data quality, refresh logic |
| 張詠翔 | BE / AI owner | Go APIs, proxy/tool handlers, data contracts, AI boundary enforcement |
| 林鈞元 | FE owner | Vue components, ApexCharts/Map integration, UI completion |
| 余振言 | integration / platform owner | cross-lane glue, Docker/runtime, observability, demo reliability, final integration acceptance |

## Lane Charters

### PM lane
- Own intake, prioritization, task shaping, quick-validation gate, demo and judge coherence.
- Convert fuzzy requests into task packets before work starts.
- Step in as executor only for escalation, ambiguity collapse, or external-dependency unblock.

### DE lane
- Own data feasibility after intake is accepted.
- Produce data-source decisions, ETL/DAG changes, schema mappings, refresh logic, and data quality notes.
- Do not implement FE or BE patches unless a task packet explicitly assigns support work.

### BE lane
- Own Go contracts, query boundaries, proxy/tool handlers, and AI-compliance enforcement.
- Produce API/query/tool artifacts consumable by FE and integration.
- Do not reopen data shaping unless the task packet says the contract depends on a DE change.

### FE lane
- Own component rendering, chart/map integration, interaction completion, and view-layer behavior.
- Consume stable contracts and validated data assumptions.
- Do not start formal build work while data or contract state is still ambiguous.

### Integration / platform lane
- Own runtime glue, env drift, Docker/local stack, observability, demo stability, merge-path, and end-to-end acceptance.
- Coordinate final integration across lanes without taking over their implementation backlog.
- Default owner for cross-cutting issues touching multiple lanes at once.

## Ownership Rules

1. One task, one DRI.
2. A task may name one optional support owner, but never two primary owners.
3. Every task must name:
- affected component or theme
- upstream dependency
- downstream consumer
- artifact to produce
- done criteria
- handoff target
4. PM does not assign work directly from chat or memory; PM assigns from a task packet.
5. If ownership is unclear, the work returns to PM intake instead of starting informally.
6. Runtime, env, Docker, observability, demo stability, and merge-path issues default to integration/platform owner.

## Default Flow

1. PM intake
2. Quick validation if data or scope is unclear
3. DE packet if data shaping is needed
4. BE packet if contract/tool/proxy work is needed
5. FE packet after contract is stable
6. Integration packet for end-to-end verification
7. PM final acceptance and judge-story check

## Handoff Protocol

Every handoff must contain:
- current artifact
- exact output path or deliverable name
- unresolved blocker or assumption
- next owner
- downstream consumer
- do-not-duplicate note

Use `handover` whenever:
- work crosses lanes
- a task becomes blocked and must transfer
- a lane finished its artifact and the next lane can start

Minimum handoff message:
- `completed artifact`
- `known gap`
- `next owner`
- `what not to redo`

## Task Start Gate

No task starts unless the packet already states:
- business outcome
- primary owner
- output artifact path
- upstream dependency
- downstream consumer
- done criteria
- handoff target

If any item is missing, route back to PM intake or `pm-task-router`.

## Escalation Tree

### Level 1: lane-local clarification
- Use when the owner only needs a small boundary clarification.
- PM confirms scope without changing DRI.

### Level 2: blocked transfer
- Use when upstream artifact is missing or a task must cross lanes.
- Emit a `handover` snapshot and assign the next single owner.

### Level 3: PM escalation execution
- Use when ambiguity collapse, external dependency unblock, or story-critical unblock requires PM to take ownership.
- PM becomes `primary_owner`; original lane becomes `support_owner`.

### Level 4: integration arbitration
- Use when multiple lanes are touching runtime or local-stack behavior at once.
- Integration/platform owner takes the issue and re-slices it back out if needed.

## Weekly and Daily Cadence

### Weekly
- Review active themes/components.
- Reconfirm top priorities and demo-critical path.
- Check whether each lane has at least one clear output artifact for the week.
- Re-slice overloaded cross-lane tasks before they start.

### Daily
- PM runs intake and confirms the top active task per lane.
- Each owner reports artifact status, not generic progress.
- Blocked work must either:
  - stay with the same owner and same artifact, or
  - hand off with a new owner and explicit gap

## Anti-Duplication Rules

- FE never reverse-engineers missing DE assumptions from scratch.
- BE never rebuilds data cleaning logic already owned by DE.
- DE never patches runtime/Docker issues already owned by integration.
- Integration does not rewrite feature code unless the task packet explicitly hands it over.
- PM does not become a second implementation owner unless escalation is declared.

## Acceptance

This harness is working when:
- any incoming request can be converted into one task packet in under 3 minutes
- no packet has more than one primary owner
- every packet names an artifact and next handoff target
- existing execution skills are reused instead of replaced
