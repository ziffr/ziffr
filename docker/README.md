# Ziffr with Docker

Ziffr is source-available: you can run it yourself, on a laptop to try it or on a server for your team. This folder holds everything for that with Docker Compose ([spec 0015](../docs/specs/0015-docker-self-hosting.md)). [Running Ziffr yourself](../docs/guides/self-hosting.md) covers the same ground in more depth, and the other way: your own Supabase project.

## Start

You need Docker with Compose 2.24 or newer, and about 1 GB of free memory.

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/compose.yml -o compose.yml
docker compose up -d
```

Open http://localhost, sign in with your email address, and create a workspace: you are its Owner. Without a mail server, the sign-in link lands in Mailpit at http://localhost:8025, which only this machine reaches.

On a server, point a domain at it (an A or AAAA record), open ports 80 and 443, and put the domain in `.env` next to `compose.yml`:

```sh
echo "ZIFFR_DOMAIN=ziffr.example.com" >> .env
docker compose up -d
```

Ziffr is then at `https://ziffr.example.com`, with a certificate from Let's Encrypt that renews itself.

Or let the installer ask for the folder, the domain and the mail server, write `.env` and start it:

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/install.sh | sh
```

## What runs

| Service | What it does | Reachable |
| --- | --- | --- |
| `proxy` | Caddy: HTTPS, and the only way in. Of Auth it passes on only what a browser needs (the sign-in link, a provider's way in and back) | ports 80, 443 |
| `app` | Ziffr itself | inside only |
| `db` | Postgres: all of Ziffr's data, in the `ziffr_db` volume | inside only |
| `auth` | Supabase Auth: sign-in links and providers | inside only (see `proxy`) |
| `rest` | PostgREST, which Ziffr's core reads and writes through | inside only |
| `init` | Makes the keys on the first start, then on every start writes each service a settings file only that service can read, then stops | — |
| `migrate` | Applies new migrations on every start and fills in the demo the first time, then stops | — |
| `clock` | Calls the jobs: Workflows every hour, emails due every five minutes | — |
| `mail` | Mailpit: catches every email while no mail server is set. Anyone with a shell on the machine can read it, so on a server set a mail server before anyone else signs in | 127.0.0.1:8025 |

## Settings

All go in `.env` next to `compose.yml`, and all are optional. After changing one, run `docker compose up -d` again.

| Setting | What it is |
| --- | --- |
| `ZIFFR_DOMAIN` | The domain people reach Ziffr at, such as `ziffr.example.com`. Empty: `http://localhost` |
| `ZIFFR_SMTP_URL`, `ZIFFR_MAIL_FROM` | Your mail server, as `'smtps://user:password@smtp.example.com:465'`, and the sender, as `'Ziffr <ziffr@example.com>'`. Used for sign-in links too. Put them in single quotes. Without them, emails go to Mailpit ([email](../docs/guides/email.md)) |
| `ZIFFR_AUTH_PROVIDERS` and `SUPABASE_AUTH_EXTERNAL_*` | Sign-in with Google, Microsoft, GitHub or LinkedIn, as in `.env.example`. The provider's redirect address is `https://<your domain>/auth/v1/callback` |
| `ZIFFR_DEMO` | Whether visitors can try the demo without an account. On at `http://localhost`, off on a domain unless `ZIFFR_DEMO=1` |
| `ZIFFR_DEMO_ONLY` | `1` makes this Ziffr a public demo and nothing else: the login page offers only the demo, nobody can sign in or make an account, and the demo starts fresh every night at 03:30 UTC |
| `ZIFFR_SITE_URL`, `ZIFFR_PROXY_HOPS` | Only behind a reverse proxy of your own (see below): the address people reach, such as `https://ziffr.example.com`, and how many proxies add to `X-Forwarded-For` (yours and Caddy: `2`) |
| `ZIFFR_HTTP_PORT`, `ZIFFR_HTTPS_PORT`, `ZIFFR_MAIL_PORT` | Other ports on this machine, when 80, 443 or 8025 are taken |
| `ZIFFR_IMAGE` | Another image than the version `compose.yml` names, such as `ghcr.io/ziffr/ziffr:X.Y.Z` or one you built |
| `ZIFFR_TELEGRAM_BOT_TOKEN` | Messages and answers by Telegram, from a bot you made with @BotFather ([Telegram](../docs/guides/telegram.md)). Needs a domain, as Telegram sends answers over https |
| Slack, replies by email, `ZIFFR_USER_GUIDE_URL` | As in [`.env.example`](../.env.example) and their guides |
| `ZIFFR_JWT_SECRET`, `ZIFFR_DB_PASSWORD`, `ZIFFR_JOB_SECRET`, `ZIFFR_SECRETS_KEY` | Only if you keep keys in a secret store instead: a value set here wins over the one made on the first start. Set them before the first start; the database password cannot change afterwards this way |

## Behind a reverse proxy you already run

When another proxy already holds ports 80 and 443 (Nginx Proxy Manager, Traefik, a load balancer), let it handle HTTPS and send requests on to Ziffr's `proxy` over plain HTTP. Leave `ZIFFR_DOMAIN` empty, so Caddy asks for no certificate, and set `ZIFFR_SITE_URL=https://ziffr.example.com` and `ZIFFR_PROXY_HOPS=2`. Your proxy must pass the `Host` header on. Then, in a `compose.override.yml` next to `compose.yml`, publish Caddy's port only where your proxy reaches it, and nowhere on the internet:

```yaml
services:
  proxy:
    # A proxy running on this machine itself:
    ports: !override ["127.0.0.1:8930:80"]
    # A proxy in a Docker container: the gateway address of its network instead, here 172.19.0.1
    # (docker network inspect <its network> shows it).
    # ports: !override ["172.19.0.1:8930:80"]
```

Your proxy then forwards to `http://127.0.0.1:8930` (or `http://172.19.0.1:8930`). Do not put Caddy on your proxy's Docker network instead: Caddy finds the app, Auth and PostgREST by their short names (`app`, `auth`, `rest`), and a container of the same name on that network (Nginx Proxy Manager's is called `app`) would receive Ziffr's requests.

## Upgrading

Read the release notes between your version and the new one in [CHANGELOG.md](../CHANGELOG.md); notes for you start with "Self-hosters:". Then download the new version's `compose.yml` (each release has it attached) and start again:

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/download/vX.Y.Z/compose.yml -o compose.yml
docker compose pull
docker compose up -d
```

`migrate` applies the new migrations before the new app starts. Migrations only add, so nothing is taken away from the version before.

## Backups

Everything is in two volumes: `ziffr_db` (the data) and `ziffr_keys` (the keys made on the first start). Back up both. Without the keys a restored database still opens, but everyone signs in again and stored Slack tokens can no longer be read. A database dump that runs while Ziffr does:

```sh
docker compose exec -T db pg_dump -U postgres -d postgres --format custom > ziffr-$(date +%F).dump
docker run --rm -v ziffr_keys:/keys -v "$PWD":/out alpine tar czf /out/ziffr-keys-$(date +%F).tgz -C /keys .
```

Try a restore once before you rely on it. The dump can also move to a Supabase project of your own: both use the same migration history.

## Stopping and removing

`docker compose stop` stops Ziffr, and `docker compose up -d` starts it again with everything as it was. `docker compose down -v` removes it **with all its data and keys**.

## Before you invite anyone

- [ ] `ZIFFR_DOMAIN` set, and `https://` works
- [ ] A mail server set, with SPF and DKIM for the sender's domain; a sign-in link and an invitation reach a real inbox
- [ ] Backups of `ziffr_db` and `ziffr_keys`, and one restore tried
- [ ] The demo off (the default on a domain), unless you set `ZIFFR_DEMO=1` to offer it
- [ ] The workspace's time zone and run hour set on the Team page; after the run hour, the Workflows page shows a run "by the clock"
- [ ] Decks: the slide editor uses tldraw, which needs a license from tldraw for production use

## Building the image yourself

From the repository root: `docker build -f docker/Dockerfile -t ziffr .`, then `ZIFFR_IMAGE=ziffr docker compose -f docker/compose.yml up -d`. `sh docker/smoke-test.sh` checks a running stack from outside, as each release does.
