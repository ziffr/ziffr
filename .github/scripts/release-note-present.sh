#!/usr/bin/env bash
# A pull request that changes what people use or run must add a release note under .changeset/ (ADR 0004).
# Changes only to docs, CI, agent settings or the changelog's own files need none. The label "no-release-note" lets
# a maintainer say a change really needs none.
set -euo pipefail
base="origin/${GITHUB_BASE_REF:-next}"
changed=$(git diff --name-only --diff-filter=ACMRD "$base"...HEAD)
labels=$(jq -r '.pull_request.labels[]?.name' "${GITHUB_EVENT_PATH:-/dev/null}" 2>/dev/null || true)
grep -qx "no-release-note" <<<"$labels" && { echo "Label no-release-note set."; exit 0; }
product=$(grep -vE '^(docs/|\.github/|\.claude/|\.vale/|\.changeset/|[^/]+\.md$)' <<<"$changed" || true)
[ -z "$product" ] && { echo "Nothing people use or run changed."; exit 0; }
added=$(git diff --name-only --diff-filter=A "$base"...HEAD -- .changeset | grep -vx '.changeset/README.md' | grep -E '\.md$' || true)
if [ -z "$added" ]; then
  echo "These change what people use or run:"; echo "$product"
  echo "Add a release note: pnpm changeset (or write .changeset/<name>.md, see .changeset/README.md)."
  echo "If it really needs none, ask a maintainer for the label no-release-note."
  exit 1
fi
for f in $added; do node -e '
  import("./scripts/release-lib.mjs").then(({ parseChangeset }) => {
    const f = process.argv[1];
    if (!parseChangeset(require("fs").readFileSync(f, "utf8"))) { console.error(f + " is not a release note (see .changeset/README.md)."); process.exit(1); }
  });' "$f"; done
echo "Release note added: $added"
