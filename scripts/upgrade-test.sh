#!/usr/bin/env bash
# The upgrade test (#602): an Installation that runs the newest release already holds the demo Workspace and a trial
# Workspace, and updates by `supabase db push` (docker/migrate.mjs). CI applies all migrations to an empty database and
# seeds the demo afterwards, so a migration that writes into demo rows without `ziffr.demo_seed` passed there and
# failed on every real Installation (#601). This script starts a clean local Supabase on the newest release's
# migrations and demo seed, adds a trial Workspace, then pushes this branch's migrations the way the image does.
# Any error fails it. Own stack: the project in a temp folder, ports <prefix>xx (UPGRADE_PORT_PREFIX, default 554 as
# in supabase/config.toml; use another prefix when a local stack already runs). Needs Docker and the Supabase CLI.
set -euo pipefail
cd "$(dirname "$0")/.."
repo=$(pwd)

prefix="${UPGRADE_PORT_PREFIX:-554}"
tag=$(git tag --list 'v[0-9]*' --merged HEAD | sort -V | tail -1)
[ -n "$tag" ] || { echo "No release tag in this checkout (CI: fetch tags and history)."; exit 1; }
echo "Upgrading from $tag to $(git rev-parse --short HEAD)"

work=$(mktemp -d)
project="ziffr-upgrade-$prefix"
stack() { supabase "$@" --workdir "$work"; }
cleanup() { stack stop --no-backup >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

# The release's own migrations and seed, with this branch's config (ports, services) under the chosen prefix.
mkdir -p "$work/supabase"
git archive "$tag" supabase/migrations supabase/seed.sql | tar -x -C "$work"
sed -e "s/554/$prefix/g" -e "s/^project_id = \"[^\"]*\"/project_id = \"$project\"/" supabase/config.toml > "$work/supabase/config.toml"

# A runner sometimes has one of Supabase's ports taken for a moment: try again (as the core-db jobs do).
started=false
for _ in 1 2 3; do
  if stack start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,storage-api,postgres-meta; then started=true; break; fi
  stack stop --no-backup || true; sleep 10
done
$started || { echo "The local Supabase did not start."; exit 1; }

psql() { docker exec -i "supabase_db_$project" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }

echo "== The release's database: demo seeded by its seed.sql, a trial Workspace as the app makes it"
[ "$(psql -tA -c "select count(*) from workspaces where id = 'd3e00000-0000-4000-8000-000000000001'")" = 1 ] \
  || { echo "The release's seed did not make the demo Workspace."; exit 1; }
psql -q <<'SQL'
insert into profiles (id, name, role, color, slack_handle, email)
  values ('upgrade-test', 'Upgrade Test', 'Founder', '#336699', 'upgrade-test', 'upgrade-test@invalid.test');
select create_trial_workspace('upgrade-test', 'Upgrade Test', 14, 100);
-- The trial had opened the Trial Guide (spec 0052 moves its state into setup_guides).
update workspaces set trial_guide_step = 'connect' where id <> 'd3e00000-0000-4000-8000-000000000001' and trial_ends_at is not null;
SQL

echo "== This branch's migrations on top, as the image's migrate step applies them"
db_url="postgresql://postgres:postgres@127.0.0.1:${prefix}22/postgres"
rm -rf "$work/supabase/migrations" && mkdir "$work/supabase/migrations"
cp "$repo"/supabase/migrations/* "$work/supabase/migrations/"
(cd "$work" && SUPABASE_TELEMETRY_DISABLED=1 supabase db push --db-url "$db_url" --include-all --yes)

echo "== The Trial Guide's state moved into the Setup Guide's tables, and the demo holds none"
[ "$(psql -tA -c "select count(*) from setup_guides g join workspaces w on w.id = g.workspace_id where w.trial_guide_step = 'connect' and g.starting_point = 'scratch'")" = 1 ] \
  || { echo "The trial's Trial Guide was not moved into setup_guides."; exit 1; }
[ "$(psql -tA -c "select count(*) from setup_guides where workspace_id = 'd3e00000-0000-4000-8000-000000000001'")" = 0 ] \
  || { echo "The demo Workspace must never have a Setup Guide."; exit 1; }

echo "Upgrade test passed: $tag -> $(git rev-parse --short HEAD)."
