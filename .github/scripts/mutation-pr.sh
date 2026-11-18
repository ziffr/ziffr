#!/usr/bin/env bash
# Mutation testing on a pull request (spec 0022; docs/guides/calculation-tests.md), within a time budget so a pull
# request waits minutes, not hours. Usage: mutation-pr.sh <base> <budget-seconds>
# - With the nightly run's results (restored from the Actions cache, at most three days old), Stryker runs
#   incrementally on the calculation modules the change touches: only mutants on changed lines, or whose tests
#   changed, are tested again.
# - Without them, only the lines the change added or rewrote in those modules are mutated.
# - When that does not finish within the budget, the job fails and says what to do, rather than running out of time.
set -euo pipefail
base="${1:?usage: mutation-pr.sh <base> <budget-seconds>}"
budget="${2:?usage: mutation-pr.sh <base> <budget-seconds>}"
cd "$(dirname "$0")/../.."
modules=$(.github/scripts/mutation-changed.sh "$base")
if [ -z "$modules" ]; then echo "No calculation module changed: nothing to mutate."; exit 0; fi

stamp=packages/core/reports/stryker-baseline-date
fresh=false
if [ -f packages/core/reports/stryker-incremental.json ] && [ -f "$stamp" ]; then
  made=$(date -u -d "$(cat "$stamp")" +%s 2>/dev/null || echo 0)
  age=$(( ($(date -u +%s) - made) / 86400 ))
  [ "$age" -le 3 ] && fresh=true
fi
if $fresh; then
  echo "Starting from the nightly results of $(cat "$stamp"): mutating $modules incrementally."
  args=(--incremental --mutate "$modules")
else
  ranges=$(.github/scripts/mutation-changed.sh "$base" --lines)
  echo "No nightly results of the last three days: mutating the changed lines only ($ranges)."
  if [ -z "$ranges" ]; then echo "Only lines were removed: nothing to mutate."; exit 0; fi
  args=(--mutate "$ranges")
fi

start=$(date +%s)
status=0
timeout "$budget" pnpm --filter @ziffr/core exec stryker run "${args[@]}" || status=$?
seconds=$(( $(date +%s) - start ))
if [ "$status" -eq 124 ]; then
  echo "::error::Mutation testing of $modules did not finish in $(( budget / 60 )) minutes, the most a pull request waits. Run the full mutation run (Actions, Numbers, Run workflow, on main) so pull requests start from fresh results, or split the change; see docs/guides/calculation-tests.md."
  exit 1
fi
if [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ -f packages/core/reports/mutation/mutation.json ]; then
  node .github/scripts/mutation-summary.mjs packages/core/reports/mutation/mutation.json "$seconds" >> "$GITHUB_STEP_SUMMARY"
fi
exit "$status"
