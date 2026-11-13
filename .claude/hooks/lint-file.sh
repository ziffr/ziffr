#!/usr/bin/env bash
# PostToolUse (Edit, Write, MultiEdit): fix what ESLint can fix in the edited file, using the ESLint setup of the
# package the file belongs to; report the rest to the agent.
set -uo pipefail
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[[ "$file" =~ \.(ts|tsx|mjs)$ ]] || exit 0
[ -f "$file" ] || exit 0
# Only files inside this project, and only this project's ESLint setups: running a linter loads its config as
# code, so a config from elsewhere must never run.
real() { python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$1"; }
root=$(real "$CLAUDE_PROJECT_DIR")
file=$(real "$file")
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
dir=$(dirname "$file")
while [ "$dir" != "$root" ] && [ ! -f "$dir/package.json" ]; do dir=$(dirname "$dir"); done
[ -f "$dir/eslint.config.mjs" ] || exit 0
cd "$dir"
out=$(pnpm exec eslint --no-warn-ignored --fix "$file" 2>&1) || { echo "ESLint found problems in $file:" >&2; echo "$out" | tail -20 >&2; exit 2; }
exit 0
