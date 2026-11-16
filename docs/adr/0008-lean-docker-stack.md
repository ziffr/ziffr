# Docker runs only the parts of Supabase Ziffr uses, and the Supabase CLI applies the migrations

Spec 0015 makes running Ziffr two commands: download `docker/compose.yml`, `docker compose up -d`. The stack has only what Ziffr uses: Postgres (`supabase/postgres`), Supabase Auth, PostgREST, Caddy in front, the app, and small steps of the app's own image that make the keys, apply the migrations and call the jobs. Ziffr does not use Supabase Storage, Realtime, Edge Functions, Studio or Kong, so they are left out. Caddy does Kong's job for the app inside the stack and lets browsers reach only the three parts of Auth they need. Migrations are applied by the Supabase CLI (`supabase db push`), inside the image, against the stack's database, with the same history table as a Supabase project has. That holds for every Installation, made with Docker or with a Supabase project of its own.

## Considered Options

- **Supabase's own self-hosting compose file, with the app added**: rejected. It runs about twelve containers and needs several gigabytes of memory for parts Ziffr never calls. People would upgrade it on Supabase's schedule. Each part it adds is also more for a self-hoster to secure and to understand.
- **Ziffr's own migration runner** (plain SQL files and a table of its own): rejected. An Installation could then not move to a Supabase project, or back, without rewriting the migration history. It would also be a second way of applying the migrations to keep correct beside the CLI that development and CI use.
- **Postgres, Auth and PostgREST without `supabase/postgres`** (plain `postgres` plus the roles created by hand): rejected for now. The migrations rely on the roles and schemas `supabase/postgres` makes, and following them by hand would break whenever Supabase changes them.

## Consequences

- Whatever Ziffr starts to use from Supabase (Storage for uploads, Realtime) has to be added to `docker/compose.yml` as well, with its route in Caddy. Otherwise it works on a Supabase project and fails in Docker.
- The image carries the Supabase CLI, about 80 MB, checked against its release's checksums, and is built on Debian rather than Alpine, because the CLI needs glibc.
- Each service runs as its own user and reads only its own settings file. Adding a service means giving it a user and a file in `docker/init.mjs`.
- Supabase Auth is reachable from outside only at `/auth/v1/verify`, `/auth/v1/authorize` and `/auth/v1/callback`. A new sign-in step that sends the browser to Auth needs its path added there.
- Studio is not part of an Installation made with Docker. People who want it run Ziffr against their own Supabase project, as [Running Ziffr yourself](../guides/self-hosting.md) describes.
- The versions of Postgres, Auth and PostgREST are pinned in `docker/compose.yml` and moved forward in releases, together with the Supabase CLI the image carries.
