#!/usr/bin/env bash
# PreToolUse (Edit, Write, MultiEdit, Read, Bash): keep agents away from secrets and from migrations that
# already exist. Paths are resolved first, so "../" or symlinks cannot get around the checks.
set -euo pipefail
# Fail closed: Claude Code only blocks on exit code 2 and lets any other failure through, so a missing tool or an
# error in here must end in 2, never in 1 or 127.
command -v jq >/dev/null && command -v python3 >/dev/null || { echo "Blocked: the guard hook needs jq and python3 on the PATH; install them." >&2; exit 2; }
trap 'echo "Blocked: the guard hook failed (.claude/hooks/guard-files.sh)." >&2; exit 2' ERR
input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
secret() { echo "Blocked: .env files hold secrets. Agents never read or write them (only .env.example); ask the person." >&2; exit 2; }

if [ "$tool" = "Grep" ] || [ "$tool" = "Glob" ]; then
  # A search reaches files through its path and through a glob (Grep's glob, Glob's pattern). Either may name an
  # env file; a speed bump like the Bash check, not a boundary. Lower-cased first: macOS opens .ENV.local as
  # .env.local. A glob may be a comma list ("*.ts,.env.local"), so .env.example is taken out wherever it stands and
  # any other ".env" left in the value counts.
  while IFS= read -r v; do
    [ -z "$v" ] && continue
    v=$(printf '%s' "$v" | tr '[:upper:]' '[:lower:]')
    if [[ "${v//.env.example/}" == *".env"* ]]; then secret; fi
  done < <(jq -r '.tool_input.path // empty, .tool_input.glob // empty, (if .tool_name == "Glob" then .tool_input.pattern // empty else empty end)' <<<"$input")
  exit 0
fi

if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  # Matching shell text is a speed bump against accidents, not a security boundary: quoting, globs and
  # variables can always spell a file name differently. The boundary is the OS (file permissions or a sandbox).
  # The whole command is checked, commit messages included: a message that names such a file is blocked too
  # (rephrase it). Every dot-name in path position counts (not process.env in code); quotes, backslashes and
  # brace expansions are removed, globs count as wildcards. Lower-cased first (macOS opens .ENV.local as
  # .env.local). Exit 1 means "sure it names none"; anything else blocks, so a crash or crafted braces that would
  # take too long count as a secret, never as a pass.
  rc=0
  python3 -c '
import fnmatch, re, sys
s = sys.stdin.read().lower()
budget = [5000]
def expand(t):
    out, todo = [], [t]
    while todo:
        budget[0] -= 1
        if budget[0] < 0:
            sys.exit(0)
        x = todo.pop()
        m = re.search(r"\{([^{}]*)\}", x)
        if m:
            todo.extend(x[:m.start()] + o + x[m.end():] for o in m.group(1).split(","))
        else:
            out.append(x)
    return out
for tok in re.findall(r"(?<![\w$])\.[\w.?*\[\]{},\\\x27\"-]+", s):
    for name in expand(re.sub(r"[\x27\"\\]", "", tok)):
        if name == ".env.example":
            continue
        if name.startswith(".env") or any(fnmatch.fnmatchcase(t, name) for t in (".env", ".env.local", ".env.production", ".env.staging", ".env.development.local")):
            sys.exit(0)
sys.exit(1)' <<<"$cmd" || rc=$?
  [ "$rc" = 1 ] || secret
  exit 0
fi

file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
[ -z "$file" ] && exit 0
resolved=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$file" 2>/dev/null) || { echo "Blocked: could not resolve $file." >&2; exit 2; }
root=$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$CLAUDE_PROJECT_DIR")
name=$(basename "$resolved" | tr '[:upper:]' '[:lower:]')
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
