#!/usr/bin/env bash
# PostToolUse (Edit, Write, MultiEdit): fix what ESLint can fix in the edited file; report the rest to the agent.
set -uo pipefail
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[[ "$file" =~ \.(ts|tsx|mjs)$ ]] || exit 0
[ -f "$file" ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
out=$(pnpm exec eslint --fix "$file" 2>&1) || { echo "ESLint found problems in $file:" >&2; echo "$out" | tail -20 >&2; exit 2; }
exit 0
