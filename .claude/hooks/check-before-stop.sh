#!/usr/bin/env bash
# Stop: when source files changed and are not committed yet, typecheck and lint before the agent finishes.
set -uo pipefail
input=$(cat)
# Already asked to fix once in this stop: don't loop.
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR"
changed=$(git status --porcelain -- src packages apps 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
[ -z "$changed" ] && exit 0
if ! out=$(pnpm exec tsc --noEmit 2>&1 | grep -v '^\.next/'); then :; fi
errors=$(echo "$out" | grep -E 'error TS' || true)
lint=$(pnpm exec eslint $(echo "$changed" | awk '{print $2}') 2>&1) || true
lint_errors=$(echo "$lint" | grep -E ' error ' || true)
if [ -n "$errors" ] || [ -n "$lint_errors" ]; then
  { echo "Before finishing, fix these:"; echo "$errors" | head -20; echo "$lint_errors" | head -20; } >&2
  exit 2
fi
exit 0
