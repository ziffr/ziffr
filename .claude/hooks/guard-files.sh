#!/usr/bin/env bash
# PreToolUse (Edit, Write, MultiEdit, Read, Bash): keep agents away from secrets and from migrations that
# already exist. Paths are resolved first, so "../" or symlinks cannot get around the checks.
set -euo pipefail
input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
secret() { echo "Blocked: .env files hold secrets. Agents never read or write them (only .env.example); ask the person." >&2; exit 2; }

if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  # Matching shell text is a speed bump against accidents, not a security boundary: quoting, globs and
  # variables can always spell a file name differently. The boundary is the OS (file permissions or a sandbox).
  # Commit messages may name these files: only messages that cannot run anything are left out of the check,
  # i.e. single-quoted ones, and double-quoted ones without $, backticks or backslashes.
  cmd=$(python3 -c '
import re, sys
s = sys.stdin.read()
s = re.sub(r"-[a-zA-Z]*m\s+\x27[^\x27]*\x27", "-m MSG", s)
s = re.sub(r"-[a-zA-Z]*m\s+\"[^\"$`\\]*\"", "-m MSG", s)
print(s)' <<<"$cmd")
  # Any .env name except exactly .env.example, and any attempt to build one from pieces.
  # Names in path position only (not process.env in code); quotes are removed and globs count as wildcards.
  if python3 -c '
import fnmatch, re, sys
s = sys.stdin.read()
for tok in re.findall(r"(?<![\w$])\.[\w.?*\[\]\x27\"-]+", s):
    name = tok.replace("\x27", "").replace("\"", "")
    if not name.startswith(".e") or name == ".env.example":
        continue
    if name.startswith(".env") or any(fnmatch.fnmatch(t, name) for t in (".env", ".env.local", ".env.production")):
        sys.exit(0)
sys.exit(1)' <<<"$cmd"; then secret; fi
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
