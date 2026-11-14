#!/usr/bin/env bash
# A pull request that changes Ziffr's public surface must also change its docs, the glossary or add a release note
# (docs/guides/documentation.md). The label "no-docs-needed" lets a maintainer say it really needs none.
set -euo pipefail
base="origin/${GITHUB_BASE_REF:-next}"
changed=$(git diff --name-only "$base"...HEAD)
labels=$(jq -r '.pull_request.labels[]?.name' "${GITHUB_EVENT_PATH:-/dev/null}" 2>/dev/null || true)
grep -qx "no-docs-needed" <<<"$labels" && { echo "Label no-docs-needed set."; exit 0; }
surface=$(grep -E '^(packages/core/src/[^/]+\.ts|supabase/migrations/|apps/web/src/app/api/|packages/mcp/|packages/sdk/|packages/connector-sdk/)' <<<"$changed" | grep -vE '\.test\.ts$' || true)
[ -z "$surface" ] && { echo "No public surface changed."; exit 0; }
docs=$(grep -E '^(docs/|\.changeset/.+\.md$|GLOSSARY\.md$|CHANGELOG\.md$|README\.md$)' <<<"$changed" || true)
if [ -z "$docs" ]; then
  echo "These change the public surface:"; echo "$surface"
  echo "Update docs/ or GLOSSARY.md, or add a release note in .changeset/, in the same pull request (or ask a maintainer for the label no-docs-needed)."
  exit 1
fi
echo "Public surface and docs both changed."
