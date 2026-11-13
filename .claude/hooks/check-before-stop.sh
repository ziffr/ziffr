#!/usr/bin/env bash
# Stop: when source files changed and are not committed yet, typecheck, lint and test before the agent finishes.
set -uo pipefail
input=$(cat)
# Already asked to fix once in this stop: don't loop.
[ "$(jq -r '.stop_hook_active // false' <<<"$input")" = "true" ] && exit 0
cd "$CLAUDE_PROJECT_DIR"
changed=$(git status --porcelain -- apps packages 2>/dev/null | grep -E '\.(ts|tsx)$' || true)
[ -z "$changed" ] && exit 0
problems=""
for step in typecheck lint test; do
  out=$(pnpm -s "$step" 2>&1) || problems+=$'\n'"$step failed:"$'\n'"$(echo "$out" | grep -E 'error|Error|FAIL|✗' | grep -v '^\.next/' | head -15)"
done
if [ -n "$problems" ]; then echo "Before finishing, fix these:$problems" >&2; exit 2; fi
exit 0
