#!/usr/bin/env bash
set -eu

MAX_BYTES="${TAIPEI_PRECOMMIT_MAX_BYTES:-524288}"

case "${SKIP_PRECOMMIT_GUARD:-}" in
  1|true|TRUE|yes|YES)
    exit 0
    ;;
esac

status=0

while IFS= read -r -d '' path; do
  [ -f "$path" ] || continue

  case "$path" in
    *.lock|*-lock.json|*-lock.yaml|*-lock.yml|*.snap)
      continue
      ;;
  esac

  size="$(wc -c < "$path" | tr -d ' ')"
  if [ "$size" -gt "$MAX_BYTES" ]; then
    echo "pre-commit blocked large file: $path (${size} bytes, limit ${MAX_BYTES})" >&2
    status=1
    continue
  fi

  if git diff --cached --numstat -- "$path" | awk '$1 == "-" && $2 == "-" { found = 1 } END { exit !found }'; then
    case "$path" in
      *.png|*.jpg|*.jpeg|*.gif|*.webp|*.ico|*.pdf)
        ;;
      *)
        echo "pre-commit blocked binary file: $path" >&2
        status=1
        ;;
    esac
  fi
done < <(git diff --cached --name-only -z --diff-filter=ACMRT)

exit "$status"
