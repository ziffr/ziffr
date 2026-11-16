#!/usr/bin/env bash
# Migrations are add-only (AGENTS.md rule 5): a pull request may add files to supabase/migrations, never change,
# delete or rename one that is already merged. Installations have applied those, so a change would never reach them.
# The agents' guard hook gives the same feedback early; this check is the one that holds.
set -euo pipefail
base="origin/${GITHUB_BASE_REF:-main}"
changed=$(git diff --name-status --diff-filter=MDRT "$base"...HEAD -- supabase/migrations)
if [ -n "$changed" ]; then
  echo "Merged migrations were changed, deleted or renamed:"
  echo "$changed"
  echo "Write a new migration file instead."
  exit 1
fi
echo "Migrations: only new files."
