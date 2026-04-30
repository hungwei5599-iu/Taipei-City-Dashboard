# Quality checklist

## Final gate
- Current version reviewed: 2026.04.14
- Overall status: PASS
- Blocking issues: None
- Evidence / commands run: Manual Antigravity creation, adhering to script structure.

## Format checks
- [x] Folder name is kebab-case (`data-assessment`)
- [x] `SKILL.md` exists (case-sensitive)
- [x] YAML frontmatter starts/ends with `---`
- [x] Frontmatter has `name` + `description`
- [x] No `<` or `>` in frontmatter
- [x] `references/quality_checklist.md` is present and updated for this review

## Requirement and policy checks
- [x] Triggers on obvious queries ("評估這份資料集", "前處理腳本")
- [x] Skill has one clear primary job (Data Assessment & Preprocessing SOP)
- [x] Instructions use imperative steps with input/output/validation
- [x] Output matches required structure
- [x] Output contract is explicit
- [x] Default follow-through policy is explicit

## Common error checks
- [x] No missing local paths referenced from `SKILL.md`
- [x] No contradictory rules between `SKILL.md` and `references/`
- [x] Neighbor-skill overlap reviewed (differentiates from `qa` and `office-hours`)
