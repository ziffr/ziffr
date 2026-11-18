#!/usr/bin/env bash
# The calculation modules a change touches, for mutation testing on a pull request (spec 0022; docs/guides/
# calculation-tests.md): those of packages/core/calculation-modules.json that differ from <base>, as one comma-separated
# list of paths relative to packages/core (what `stryker run --mutate` takes). Prints nothing when none changed.
set -euo pipefail
base="${1:?usage: mutation-changed.sh <base>}"
changed=$(git diff --name-only "$base"...HEAD -- packages/core | sed 's#^packages/core/##')
node -e '
  const modules = require("./packages/core/calculation-modules.json");
  const changed = new Set(process.argv[1].split("\n").filter(Boolean));
  process.stdout.write(modules.filter((m) => changed.has(m)).join(","));
' "$changed"
