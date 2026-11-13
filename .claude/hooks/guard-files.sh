#!/usr/bin/env bash
# PreToolUse (Edit, Write, MultiEdit): keep agents away from secrets and from migrations that already exist.
set -euo pipefail
input=$(cat)
file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$file" ] && exit 0
rel=${file#"$CLAUDE_PROJECT_DIR"/}
case "$(basename "$rel")" in
  .env.example) ;;
  .env|.env.*) echo "Blocked: $rel holds secrets. Agents never read or write .env files; ask the person to change it." >&2; exit 2 ;;
esac
if [[ "$rel" == supabase/migrations/* ]] && git -C "$CLAUDE_PROJECT_DIR" ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
  echo "Blocked: $rel is an existing migration. Migrations are add-only: write a new migration file instead." >&2
  exit 2
fi
exit 0
