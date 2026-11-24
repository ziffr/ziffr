#!/usr/bin/env bash
# The quick pull-request checks of CI's `hygiene` job, in seconds, against origin/main: a missing release note, guide chapter or docs
# change, a client component importing the database, an edited migration, a name missing from the glossary. Run it before every push:
# these mistakes are the commonest reason a pull request goes red, and CI finds them only after you pushed. Labels such as
# no-release-note, no-docs-needed and no-guide-change exist only on GitHub, so a message that offers one may be answered there.
set -uo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main 2>/dev/null || true
status=0
step() {
  local name="$1"; shift
  echo "▸ $name"
  "$@" || { echo "✗ $name"; status=1; }
}
step "Client components import only pure core modules" node .github/scripts/client-imports.mjs
step "The app reaches the database only through the core" node .github/scripts/app-db-access.mjs
step "Public surface changes come with docs" .github/scripts/docs-touched.sh
step "Changed screens come with their user guide chapter" node .github/scripts/guide-touched.mjs
step "Changes people use or run come with a release note" .github/scripts/release-note-present.sh
step "Migrations are only added, never changed" .github/scripts/migrations-add-only.sh
step "New names in the UI are in the glossary" node scripts/glossary-names.mjs
step "Bookkeeping tests (api coverage, lists, generated files, demo table)" bash scripts/bookkeeping-tests.sh
step "Docs audit" node scripts/docs-audit.mjs
if command -v vale >/dev/null 2>&1; then
  step "Prose (Vale)" vale --minAlertLevel=error docs/guides docs/user-guide docs/specs docs/security README.md CONTRIBUTING.md AGENTS.md SECURITY.md CHANGELOG.md
else
  echo "▸ Prose (Vale): not installed here, CI checks it"
fi
[ "$status" -eq 0 ] && echo "All quick checks passed." || echo "Fix the lines marked ✗ before you push."
exit "$status"
