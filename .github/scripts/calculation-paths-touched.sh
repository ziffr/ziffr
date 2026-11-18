#!/usr/bin/env bash
# Whether a change touches the calculation paths (.github/calculation-paths.txt, spec 0022): exits 0 and names the
# files when it does, 1 when it does not. Compares HEAD with the base given (default origin/main), as CI's `numbers`
# job and `pnpm ci:local` do. A migration counts when it names observations, series_values or breakdowns.
set -euo pipefail
cd "$(dirname "$0")/../.."
base="${1:-origin/main}"
changed=$(git diff --name-only "$base"...HEAD 2>/dev/null || git diff --name-only "$base" HEAD)
patterns=$(grep -vE '^\s*(#|$)' .github/calculation-paths.txt)
hits=$(grep -E -f <(echo "$patterns") <<<"$changed" || true)
for f in $(grep -E '^supabase/migrations/.+\.sql$' <<<"$changed" || true); do
  [ -f "$f" ] && grep -qE 'observations|series_values|breakdowns' "$f" && hits+=$'\n'"$f"
done
hits=$(sed '/^$/d' <<<"$hits")
if [ -n "$hits" ]; then
  echo "Calculation paths changed:"; echo "$hits" | sed 's/^/  /'
  exit 0
fi
echo "No calculation path changed."
exit 1
