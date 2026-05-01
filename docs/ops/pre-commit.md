# Pre-commit Guard

This repo uses a lightweight pre-commit gate to stop accidental large files and unexpected binaries from entering commits.

## Install

From the inner app repo:

```bash
cd ~/projects/Taipei_Dashdorad/Taipei-City-Dashboard
scripts/install-precommit.sh
```

If the `pre-commit` Python package is available, the installer uses `.pre-commit-config.yaml`.
If it is not available, the installer writes an equivalent fallback Git hook to `.git/hooks/pre-commit`.

## What It Blocks

- Staged files larger than 512 KiB by default.
- Binary files except common reviewable demo/document assets: `png`, `jpg`, `jpeg`, `gif`, `webp`, `ico`, and `pdf`.
- Lock files and snapshots are exempt from the size rule because they are expected generated artifacts.

Change the size limit for one commit with:

```bash
TAIPEI_PRECOMMIT_MAX_BYTES=1048576 git commit
```

Bypass the local fallback hook only when you have manually reviewed the staged files:

```bash
SKIP_PRECOMMIT_GUARD=1 git commit
```

## Manual Check

Run the same guard without committing:

```bash
scripts/pre-commit/large-file-guard.sh
```

## Scope Notes

The outer `~/projects/Taipei_Dashdorad` repo mostly tracks the inner app repo as a gitlink, so the versioned hook config lives inside `Taipei-City-Dashboard`.
The outer repo may still have a local `.git/hooks/pre-commit` installed to catch accidental large artifacts at the workspace layer.
