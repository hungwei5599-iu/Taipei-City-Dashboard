# Git Audit Checklist

Last updated: 2026-05-01

Run before each commit in the competition fork.

```bash
git status --short
find . -maxdepth 3 \( -name ".env" -o -name "node_modules" -o -name "venv" -o -name ".venv" \) -print
git diff --cached --stat
git diff --cached -- package.json go.mod go.sum
```

## Pass Criteria

- No `.env` file is staged.
- No `node_modules`, `venv`, or `.venv` is staged.
- No unapproved dependency file changes are staged.
- Commit message describes a verifiable unit.
- Commit date is not manipulated.
- Old repository code is not copied in as staged chunks.
