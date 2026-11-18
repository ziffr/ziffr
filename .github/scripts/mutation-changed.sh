#!/usr/bin/env bash
# The calculation modules a change touches, for mutation testing on a pull request (spec 0022; docs/guides/
# calculation-tests.md): those of packages/core/calculation-modules.json that differ from <base>, as one comma-separated
# list of paths relative to packages/core (what `stryker run --mutate` takes). With --lines, each module comes with the
# lines the change added or rewrote ("src/compare.ts:120-131"), so only mutants there are tested. Prints nothing when
# no calculation module changed.
set -euo pipefail
base="${1:?usage: mutation-changed.sh <base> [--lines]}"
lines="${2:-}"
changed=$(git diff --name-only "$base"...HEAD -- packages/core | sed 's#^packages/core/##')
hunks=""
if [ "$lines" = "--lines" ]; then
  # "+@@ -a,b +c,d @@" for each changed stretch, as file:first-last of the new text; a pure deletion has none.
  hunks=$(git diff --unified=0 "$base"...HEAD -- packages/core | awk '
    /^\+\+\+ b\/packages\/core\// { file = substr($2, length("b/packages/core/") + 1); next }
    /^@@/ { split($3, c, ","); start = substr(c[1], 2); n = (c[2] == "" ? 1 : c[2]); if (n > 0) print file ":" start "-" (start + n - 1) }')
fi
node -e '
  const modules = require("./packages/core/calculation-modules.json");
  const changed = new Set(process.argv[1].split("\n").filter(Boolean));
  const hunks = process.argv[2].split("\n").filter(Boolean);
  const picked = modules.filter((m) => changed.has(m));
  const out = process.argv[3] === "--lines" ? hunks.filter((h) => picked.includes(h.split(":")[0])) : picked;
  process.stdout.write(out.join(","));
' "$changed" "$hunks" "$lines"
