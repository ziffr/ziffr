# 0015 Running Ziffr with one download

**Status:** done. **Tracking issue:** #201 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0015`. **Decision:** ADR 0008 (ticket 3).

## Problem Statement

Ziffr is meant to be run by the teams that use it, but an installation today takes an afternoon and some knowledge of Supabase:

- **Too many parts to put together by hand.** [Running Ziffr yourself](../guides/self-hosting.md) asks for a Supabase project, the Supabase CLI to push 60-odd migrations, a Node 22 build of the app from a checkout, a reverse proxy with HTTPS, and cron for two jobs. Each step works, but together they lose most people who only want to try it on their own server.
- **No image and no compose file.** The repository has no Dockerfile, no published image and no `docker-compose.yml`. Most self-hosted tools start with one command, and people expect the same here.
- **Keys made by hand.** The person running Ziffr has to make a JWT secret, sign an anon key and a service role key with it, and make the job and secrets keys. Getting one wrong gives errors that are hard to read.
- **The image could not be shared anyway.** Next.js writes `NEXT_PUBLIC_*` settings into the build, so a built app works only with the Supabase address it was built for.

## Solution

Two commands, on any machine with Docker:

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/compose.yml -o compose.yml
docker compose up -d
```

Ziffr is then at `http://localhost`. On a server with a domain pointed at it, `ZIFFR_DOMAIN=ziffr.example.com docker compose up -d` gives the same at `https://ziffr.example.com`, with a certificate from Let's Encrypt.

For those who want to be asked, an install script does the same and asks for the domain and the mail server first:

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/install.sh | sh
```

```
 Ziffr installer
 Folder for Ziffr [./ziffr]:
 Domain (empty for http://localhost): ziffr.example.com
 Mail server, as smtps://user:password@host:465 (empty to skip): smtps://…
 Sender [Ziffr <ziffr@ziffr.example.com>]:
 Wrote ./ziffr/compose.yml and ./ziffr/.env
 Starting… Ziffr is running at https://ziffr.example.com
 Sign in with your email address; the first workspace you create is yours.
```

What runs is the smallest stack Ziffr needs, not the whole of Supabase:

| Service | Image | Job |
|---|---|---|
| `proxy` | Caddy | The only part reachable from outside, on ports 80 and 443. HTTPS for a domain, plain HTTP on localhost. Sends `/auth/v1/*` to `auth` (sign-in links and providers must reach it) and everything else to `app` |
| `app` | `ghcr.io/ziffr/ziffr` | The Next.js server |
| `db` | `supabase/postgres` | All of Ziffr's data, in a named volume |
| `auth` | `supabase/gotrue` | Sign-in links and providers |
| `rest` | `postgrest/postgrest` | What the core reads and writes through |
| `init` | `ghcr.io/ziffr/ziffr`, runs first on every start | Makes the keys on the first start; works out every service's settings on every start |
| `migrate` | `ghcr.io/ziffr/ziffr`, runs once per start | Applies new migrations, fills in the demo the first time |
| `clock` | `ghcr.io/ziffr/ziffr` | Calls the two jobs: Workflows every hour, deliveries every five minutes |
| `mail` | Mailpit | Catches every email while no mail server is set, at `http://localhost:8025`, reachable from this machine only |

## User Stories

1. As someone who heard about Ziffr, I want to try it on my own laptop with two commands, and to throw it away just as easily.
2. As the person who runs our servers, I want Ziffr on our domain with HTTPS without setting up a proxy or certificates myself.
3. As that person, I want the keys made for me and kept, so that a restart or an upgrade never signs everyone out or loses Slack tokens.
4. As that person, I want an upgrade to be: change the version, `docker compose pull`, `docker compose up -d`, and the migrations happen by themselves.
5. As that person, I want to see what my installation runs and change it, so the compose file stays readable and every setting has a comment.
6. As someone trying it without a mail server, I still want to receive my sign-in link.
7. As a contributor, I want the image and the compose file checked in CI on every release, so the two commands never break unnoticed.

## Implementation Decisions

- **Words:** "source-available" and "run it yourself", never "open source" (ADR 0002).
- **Where it lives:** `docker/` at the repository root: `Dockerfile`, `compose.yml`, `install.sh`, `init.mjs`, `migrate.mjs`, `clock.mjs`, `entrypoint.sh`, `smoke-test.sh`, `README.md`. The compose file is self-contained: Caddy's configuration is inlined with `configs:`, so the one download is enough. `install.sh` downloads `compose.yml` and writes `.env`; it never pipes another script.
- **The image:** one multi-stage Dockerfile, built from the repository root. `output: "standalone"` in `apps/web/next.config.ts`; the image carries the standalone server, the static files, `supabase/migrations`, the scripts in `docker/`, the user guide chapters and `GLOSSARY.md` (read from disk by `/guide`), and the Supabase CLI for migrations. It runs as a user without root on Node 22, on Debian (the Supabase CLI needs glibc). Tags: `X.Y.Z`, `X.Y`, `latest`, for `linux/amd64` and `linux/arm64`.
- **Settings at run time, not at build:** the app reads the Supabase address and anon key for sign-in from server settings (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) in `middleware.ts` and `lib/auth.ts` instead of `NEXT_PUBLIC_*`, which Next.js fixes at build time. No browser code reads them today; the build keeps failing if the service role key could reach a browser. `NEXT_PUBLIC_SUPABASE_*` keep working for existing installations and are read when the new names are not set.
- **Keys:** on its first start `init` makes the JWT secret, the anon and service role keys (signed with it, as Supabase expects), `ZIFFR_JOB_SECRET`, `ZIFFR_SECRETS_KEY` and the database password, and writes them to a `keys` volume that only root reads. On every start it writes each service its own settings file with only what that service needs, readable only by that service's user (each runs as its own), read when the service starts (`docker/entrypoint.sh`); PostgREST gets a configuration file, since its image has no shell. Caddy, the part reachable from outside, gets no keys at all. The roles Auth and PostgREST sign in as have passwords of their own, and the app gets only its own settings from `.env`, never Auth's provider secrets. When `init` runs again with changed settings, the services that read its files start again (`depends_on … restart: true`). This followed the security reviews of the first build. Services that depend on the domain and ports name them in their own configuration, so a change makes Compose start them again. A key already set in `.env` wins, so they can live in a secret store instead. `docker/README.md` says to back up the `keys` volume with the database: without `ZIFFR_SECRETS_KEY` stored Slack tokens are lost.
- **Migrations:** `migrate` runs `supabase db push --db-url …` against `db`, the same command and the same migration table (`supabase_migrations.schema_migrations`) as the guide's path today. An installation can therefore move between the compose file and a Supabase project of its own with `pg_dump` and keep its history. `app` starts only after `migrate` finished (`depends_on: service_completed_successfully`), and `migrate` only after `auth` has made the `auth` schema, which one Ziffr migration refers to.
- **The demo:** `migrate` calls `demo_reset` the first time the demo is offered. It is offered at `http://localhost`, and on a domain only with `ZIFFR_DEMO=1`, which `install.sh` asks about. With a domain and no mail server, `init` warns and `install.sh` asks again, since anyone with a shell on the server can read Mailpit's sign-in links.
- **Sign-in:** `auth` is set up from the same settings as the app: site URL and the `/auth/callback` redirect from `ZIFFR_DOMAIN`, email confirmations on, its sign-in mail through `ZIFFR_SMTP_URL` (split into host, port, user and password by `init`; Mailpit when it is not set). Providers work as in the guide, through the `SUPABASE_AUTH_EXTERNAL_*` settings `.env.example` already lists.
- **What is reachable:** only `proxy`, on 80 and 443. Mailpit's inbox only on 127.0.0.1. `db`, `rest`, `auth` and `app` publish no port. `ZIFFR_PROXY_HOPS=1` is set, since Caddy is the one proxy. Of Auth, only `GET` and `HEAD` to `/auth/v1/verify`, `/auth/v1/authorize` and `/auth/v1/callback` reach it from outside, so sign-in codes cannot be tried by `POST`; the app reaches the rest of Auth and PostgREST through Caddy's internal address `proxy:8000`.
- **Version pinning:** `compose.yml` on `main` names the latest release (`ghcr.io/ziffr/ziffr:${ZIFFR_VERSION:-X.Y.Z}`), and every release attaches its own `compose.yml` and `install.sh`. `pnpm release` updates the version in them, like the changelog. The images of Postgres, Auth, PostgREST, Caddy and Mailpit are pinned to exact versions and moved forward in releases, never `latest`.
- **Releases:** `release.yml` builds the image for both platforms and pushes it to GHCR when a version tag is pushed. It then starts the compose file in the runner and runs `docker/smoke-test.sh`: `/api/health` (new, answers only "ok"), only the intended paths reachable, and a sign-in link arrives in Mailpit and leads back to the app. This one run on each release costs a few minutes; it does not run on pull requests, since Actions minutes are counted.
- **The guide:** `self-hosting.md` starts with the two commands and keeps the current path as "With your own Supabase project", for those who already run Supabase or want a hosted one. Its checklist applies to both.
- **ADR 0008** records the two choices that are hard to take back: the lean stack instead of Supabase's own compose file, and the Supabase CLI as the one way migrations are applied.
- **Glossary:** **Installation** gets an entry ("one running Ziffr: its app, its database and its keys, on one domain"); the word is already used for the demo switch.

## Tickets (in order)

1. #202 Settings at run time: the app reads `SUPABASE_URL` and `SUPABASE_ANON_KEY` on the server, falls back to `NEXT_PUBLIC_*`, `/api/health`, `.env.example` and the guide updated.
2. #203 The image: Dockerfile, `output: "standalone"`, the guide and glossary files inside, the Supabase CLI, a user without root; built and started locally against `pnpm prototype`'s Supabase (blocked by #202).
3. #204 The compose file: the services above, `init` (keys and settings), `migrate` (migrations, demo), the inlined Caddy configuration, `clock`, `mail`, `docker/README.md`, ADR 0008, glossary (blocked by #203).
4. #205 `install.sh`: asks for folder, domain, mail server and sender; writes `.env`; starts and waits for `/api/health` (blocked by #204).
5. #206 Releases: build and push to GHCR for amd64 and arm64, the compose check in the runner, `compose.yml` and `install.sh` attached to the release, `pnpm release` updating their version (blocked by #204).
6. #207 The guide: the two commands first, the current path as the alternative, upgrades and backups for both (blocked by #205 and #206).

## Testing Decisions

- **Separation:** each service reads its own settings file and no other; Caddy has no keys.
- **Image:** built locally, starts, `/api/health` answers, `/guide` shows its chapters, the service role key is not in any file under `.next/static`.
- **Compose, on a clean machine** (a fresh Linux VM and Docker Desktop on a Mac): two commands, sign in with a link from Mailpit, create a workspace, see the demo. `docker compose down` and `up` again: still signed in, same data, no new keys. Upgrade from the previous image: new migrations applied, data kept.
- **On a domain:** a real certificate from Let's Encrypt (staging first), sign-in with an email from a real mail server, the Workflows page shows a run "by the clock" after the run hour.
- **Exposure:** from outside the machine, only 80 and 443 answer; `/rest/v1`, `/auth/v1/admin` and the database port do not.
- **install.sh:** with `shellcheck`, and on `sh` (dash) and `bash`; run twice, it keeps the existing `.env`.
- No new core operations, so no new `*.db.test.ts`.

## Settled Questions

- **Download and script:** the compose file works on its own; `install.sh` is a convenience on top that asks the questions.
- **Stack:** the lean one. Ziffr uses Postgres, Auth and PostgREST only, not Storage, Realtime, Edge Functions or Studio. People who want Studio run Ziffr against their own Supabase, as the guide describes today.
- **Install URL:** `raw.githubusercontent.com` first, since it costs nothing. It works once the repository is public, and the two commands are tried from it before then with a token. A short address such as `get.ziffr.…` comes later as a redirect to it, so URLs already in READMEs and posts keep working.
- **"Open source":** the README, `docker/README.md`, the installer and the guide say "source-available" and "run it yourself", as ADR 0002 allows. This has to be settled before the repository goes public: either the licence changes, with a new ADR that replaces 0002, or the wording stays. That choice is outside this spec.
- **tldraw:** the installer prints once, at the end, that decks use tldraw, which needs a licence from tldraw for production use. `docker/README.md` and the guide's checklist say the same. Whether to buy a licence that covers self-hosters, move decks to `ee/` or replace tldraw is decided outside this spec.

## Out of Scope

Kubernetes and Helm charts, one-click buttons for hosting platforms, backups run by the stack itself, a web installer, more than one app container behind the proxy, and Supabase Storage (Ziffr does not use it yet).
