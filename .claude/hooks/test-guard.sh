#!/usr/bin/env bash
# Runs the guard hook against its cases: expected exit code, tab, hook input.
cd "$(dirname "$0")/../.." || exit 1
fail=0
while IFS=$'\t' read -r want json; do
  printf '%s' "$json" | CLAUDE_PROJECT_DIR=$PWD .claude/hooks/guard-files.sh >/dev/null 2>&1; got=$?
  [ "$got" = "$want" ] || { echo "FAIL want $want got $got: $json"; fail=1; }
done < .claude/hooks/guard-files.cases.tsv
# Without jq and python3 on the PATH the guard must block, not let the call through.
nopath=$(mktemp -d); ln -s "$(command -v bash)" "$nopath/bash"
printf '%s' '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | CLAUDE_PROJECT_DIR=$PWD PATH=$nopath bash .claude/hooks/guard-files.sh >/dev/null 2>&1; got=$?
rm -rf "$nopath"
[ "$got" = 2 ] || { echo "FAIL want 2 got $got: guard without jq and python3"; fail=1; }
[ $fail = 0 ] && echo "all guard cases pass"
exit $fail
