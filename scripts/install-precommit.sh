#!/usr/bin/env bash
set -eu

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d .git ]; then
  echo "Not a git repository: $ROOT_DIR" >&2
  exit 1
fi

if command -v pre-commit >/dev/null 2>&1; then
  pre-commit install --config .pre-commit-config.yaml
  echo "Installed pre-commit framework hook for $ROOT_DIR"
  exit 0
fi

HOOK=".git/hooks/pre-commit"
if [ -f "$HOOK" ] && ! grep -q "taipei-dashdorad fallback pre-commit" "$HOOK"; then
  cp "$HOOK" "$HOOK.bak"
  echo "Existing pre-commit hook backed up to $HOOK.bak"
fi

cat > "$HOOK" <<'HOOK'
#!/usr/bin/env bash
# taipei-dashdorad fallback pre-commit
set -eu

[ "${SKIP_PRECOMMIT_GUARD:-}" = "1" ] && exit 0

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

scripts/pre-commit/large-file-guard.sh
HOOK

chmod +x "$HOOK"
echo "pre-commit is not installed; installed fallback hook at $ROOT_DIR/$HOOK"
