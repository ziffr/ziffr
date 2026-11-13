#!/usr/bin/env bash
# Runs the guard hook against its cases: expected exit code, tab, hook input.
cd "$(dirname "$0")/../.." || exit 1
fail=0
while IFS=$'\t' read -r want json; do
  printf '%s' "$json" | CLAUDE_PROJECT_DIR=$PWD .claude/hooks/guard-files.sh >/dev/null 2>&1; got=$?
  [ "$got" = "$want" ] || { echo "FAIL want $want got $got: $json"; fail=1; }
done < .claude/hooks/guard-files.cases.tsv
[ $fail = 0 ] && echo "all guard cases pass"
exit $fail
