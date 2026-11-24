#!/usr/bin/env bash
# The tests that only check lists, docs and generated files against the code: seconds each, no database. CI runs them in the
# `bookkeeping` job, so a forgotten line in docs/api-coverage.md shows in the first minutes, and `pnpm precheck` runs them too.
# They also run in the unit job; this is the early signal.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm --filter @ziffr/core exec vitest run src/api-coverage.test.ts src/extensions.test.ts src/catalogue.test.ts
pnpm --filter @ziffr/web exec vitest run src/app/demo-read-only-table.test.ts src/app/api/v1/openapi.test.ts src/lib/help-index.test.ts src/lib/user-guide-render.test.ts
