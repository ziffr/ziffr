#!/usr/bin/env bash
# PreToolUse (Edit, Write, MultiEdit, Read, Grep, Glob, Bash): keep agents away from secrets and from migrations
# that already exist. Paths are resolved first, so "../" or symlinks cannot get around the checks.
set -euo pipefail
# Fail closed: Claude Code only blocks on exit code 2 and lets any other failure through, so a missing tool or an
# error in here must end in 2, never in 1 or 127.
command -v jq >/dev/null && command -v python3 >/dev/null || { echo "Blocked: the guard hook needs jq and python3 on the PATH; install them." >&2; exit 2; }
trap 'echo "Blocked: the guard hook failed (.claude/hooks/guard-files.sh)." >&2; exit 2' ERR
input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")
secret() { echo "Blocked: .env files hold secrets. Agents never read or write them (only .env.example); ask the person." >&2; exit 2; }

# Does a shell command (mode "bash") or a search glob (mode "glob") name an env file? Prints "ok" only when it is
# sure it does not; anything else (a crash, an input too big to check) counts as a secret. Brace expansion has a
# fixed budget, so crafted braces cannot recurse, run out the hook's time or crash it into "ok". A glob counts when
# it would match an env file name, "*" alone included: an explicit glob makes ripgrep search hidden files too.
checker='
import fnmatch, re, sys
mode, s = sys.argv[1], sys.stdin.read()
NAMES = (".env", ".env.local", ".env.production", ".env.staging", ".env.development.local")
budget = [5000]
def expand(t):
    out, todo = [], [t]
    while todo:
        budget[0] -= 1
        if budget[0] < 0:
            raise SystemExit("too big to check")
        x = todo.pop()
        m = re.search(r"\{([^{}]*)\}", x)
        if m:
            todo.extend(x[:m.start()] + o + x[m.end():] for o in m.group(1).split(","))
        else:
            out.append(x)
    return out
def secret(name):
    if name == ".env.example":
        return False
    return name.startswith(".env") or any(fnmatch.fnmatch(n, name) for n in NAMES)
if mode == "bash":
    # Every dot-name in path position (not process.env in code); quotes and backslashes removed.
    names = [n for tok in re.findall(r"(?<![\w$])\.[\w.?*\[\]{},\\\x27\"-]+", s)
             for n in expand(re.sub(r"[\x27\"\\]", "", tok))]
else:
    # Several patterns may be given; a "!" pattern only excludes. Only the last path part names the file.
    names = [p.rsplit("/", 1)[-1] for tok in s.split() for p in expand(tok) if not p.startswith("!")]
print("block" if any(secret(n) for n in names) else "ok")
'
names_secret() { [ "$(python3 -c "$checker" "$1" <<<"$2" 2>/dev/null || true)" != ok ]; }

if [ "$tool" = "Grep" ] || [ "$tool" = "Glob" ]; then
  # A search reaches files through its path and through a glob (Grep's glob, Glob's pattern); either may name an
  # env file. A speed bump like the Bash check, not a boundary.
  while IFS= read -r v; do
    [ -z "$v" ] && continue
    b=$(basename -- "$v")
    if [[ "$b" == .env* && "$b" != ".env.example" ]]; then secret; fi
  done < <(jq -r '.tool_input.path // empty' <<<"$input")
  while IFS= read -r v; do
    [ -z "$v" ] && continue
    if names_secret glob "$v"; then secret; fi
  done < <(jq -r '.tool_input.glob // empty, (if .tool_name == "Glob" then .tool_input.pattern // empty else empty end)' <<<"$input")
  exit 0
fi

if [ "$tool" = "Bash" ]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  # Matching shell text is a speed bump against accidents, not a security boundary: quoting, globs and
  # variables can always spell a file name differently. The boundary is the OS (the sandbox, file permissions).
  # The whole command is checked, commit messages included: a message that names such a file is blocked too
  # (rephrase it).
  if names_secret bash "$cmd"; then secret; fi
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
