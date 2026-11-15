#!/usr/bin/env bash
# `pnpm ci:local`: everything CI checks (.github/workflows/ci.yml), on this machine, against the local Supabase that
# `pnpm prototype` (or `supabase start`) already runs. Run it before pushing: GitHub Actions minutes are counted, local
# runs are not. Steps whose tool is not installed (gitleaks, vale) are skipped with a note; CI still runs them.
# `--quick` leaves out the database, the app build and the SDK and MCP tests.
set -euo pipefail
cd "$(dirname "$0")/.."

quick=false
[ "${1:-}" = "--quick" ] && quick=true
step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "Types, lint, unit tests"
pnpm typecheck
pnpm lint
pnpm test

step "Security"
if command -v gitleaks >/dev/null; then gitleaks git --redact --no-banner .; else echo "gitleaks not installed: skipped (brew install gitleaks)"; fi
pnpm audit --prod
node .github/scripts/client-imports.mjs
node .github/scripts/app-db-access.mjs

step "Prose"
if command -v vale >/dev/null; then vale --minAlertLevel=error docs/guides docs/user-guide docs/specs docs/security README.md CONTRIBUTING.md AGENTS.md SECURITY.md CHANGELOG.md; else echo "vale not installed: skipped (brew install vale)"; fi

step "Docs, user guide and release note (against origin/next)"
.github/scripts/docs-touched.sh
node .github/scripts/guide-touched.mjs
.github/scripts/release-note-present.sh

$quick && { echo; echo "Quick checks passed."; exit 0; }

step "The core and the API against the local database"
# The database's port, not `supabase status`, which also fails when optional services are stopped.
nc -z 127.0.0.1 55422 2>/dev/null || { echo "Local Supabase is not running: start it with 'supabase start'."; exit 1; }
# The local Supabase's address and keys are fixed development values, not secrets. `supabase status` fails while a
# container's health check is slow (often under load), so it is asked again for up to a minute.
settings=""
for _ in $(seq 1 30); do
  settings="$( (supabase status -o json 2>/dev/null || true) | node -e 'const t = require("fs").readFileSync(0, "utf8"); try { const s = JSON.parse(t.slice(t.indexOf("{"))); if (s.API_URL && s.SERVICE_ROLE_KEY) for (const k of ["API_URL", "ANON_KEY", "SERVICE_ROLE_KEY"]) console.log(`export ${k}=${JSON.stringify(s[k])}`); } catch {}')"
  [ -n "$settings" ] && break
  sleep 2
done
[ -n "$settings" ] || { echo "Local Supabase does not answer: check 'supabase status'."; exit 1; }
eval "$settings"
export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
pnpm --filter @ziffr/core test:db
pnpm --filter @ziffr/web test:db

step "The app, built and running, for the SDK, the MCP server and the feed kits"
# A separate build folder and port, so a running `pnpm dev` is left alone.
# `next build` adds the build folder's types to tsconfig.json; the file is put back as it was.
export NEXT_DIST_DIR=.next-ci PORT=3999
cp apps/web/tsconfig.json /tmp/ziffr-ci-tsconfig.json
pnpm --filter @ziffr/web exec next build >/dev/null || { cp /tmp/ziffr-ci-tsconfig.json apps/web/tsconfig.json; exit 1; }
cp /tmp/ziffr-ci-tsconfig.json apps/web/tsconfig.json
(cd apps/web && node ./node_modules/next/dist/bin/next start -p "$PORT" > /tmp/ziffr-ci-app.log 2>&1 & echo $! > /tmp/ziffr-ci-app.pid)
# `next start` runs the app in a child process (next-server) that outlives its parent: stop whatever listens on the
# port as well, so no built app is left running after the checks.
trap 'kill "$(cat /tmp/ziffr-ci-app.pid)" 2>/dev/null || true; lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -sf "http://localhost:$PORT/api/v1/openapi.json" >/dev/null && break; sleep 1; done
ZIFFR_TEST_URL="http://localhost:$PORT" pnpm --filter @ziffr/sdk test:app
ZIFFR_TEST_URL="http://localhost:$PORT" pnpm --filter @ziffr/mcp test:app
ZIFFR_TEST_URL="http://localhost:$PORT" pnpm --filter @ziffr/feed-kit test:app
ZIFFR_TEST_URL="http://localhost:$PORT" pnpm --filter @ziffr/feed-sql test:app

echo; echo "Everything CI checks passed locally."
