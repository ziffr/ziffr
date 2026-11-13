#!/usr/bin/env bash
# PreToolUse (Edit, Write, MultiEdit, Read, Bash): keep agents away from secrets and from migrations that
# already exist. Paths are resolved first, so "../" or symlinks cannot get around the checks.
set -euo pipefail
input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
secret() { echo "Blocked: .env files hold secrets. Agents never read or write them (only .env.example); ask the person." >&2; exit 2; }

if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  # Commit messages may talk about these files: leave out the text of -m "..." or -m '...' before checking.
  cmd=$(python3 -c '
import re, sys
print(re.sub(r"-[a-zA-Z]*m\s+(\"(?:[^\"\\]|\\.)*\"|\x27[^\x27]*\x27)", "-m MSG", sys.stdin.read()))' <<<"$cmd")
  # Any mention of a .env file other than .env.example.
  if grep -Eq '\.env([^.a-zA-Z0-9_-]|$|\.(local|production|development|test)|\*)' <<<"$cmd"; then secret; fi
  exit 0
fi

file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$file" ] && exit 0
resolved=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$file" 2>/dev/null) || { echo "Blocked: could not resolve $file." >&2; exit 2; }
root=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$CLAUDE_PROJECT_DIR")
name=$(basename "$resolved")
if [[ "$name" == .env* && "$name" != ".env.example" ]]; then secret; fi
[ "$tool" = "Read" ] && exit 0
case "$resolved" in
  "$root"/*) rel=${resolved#"$root"/} ;;
  *) exit 0 ;;
esac
if [[ "$rel" == supabase/migrations/* ]] && git -C "$root" ls-files --error-unmatch -- "$rel" >/dev/null 2>&1; then
  echo "Blocked: $rel is an existing migration. Migrations are add-only: write a new migration file instead." >&2
  exit 2
fi
exit 0
