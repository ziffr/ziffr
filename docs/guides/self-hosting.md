# Running Ziffr yourself

Ziffr is source-available: you can run it yourself, for your team, on your own machines. There are two ways:

- **With Docker** (start here): one file, two commands, everything inside. [Docker](#with-docker) below and [docker/README.md](../../docker/README.md).
- **With your own Supabase project**: if you already run Supabase or want a hosted one, the app on a Node server of your choice. [The steps](#with-your-own-supabase-project) below.

Both end with the same [checklist](#before-you-invite-anyone). The [scheduled jobs](jobs.md) and [email](email.md) guides cover those two parts in more depth.

## With Docker

You need Docker with Compose 2.24 or newer, and about 1 GB of free memory.

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/compose.yml -o compose.yml
docker compose up -d
```

Open http://localhost, sign in with your email address (without a mail server the link lands in Mailpit, at http://localhost:8025), and create a workspace: you are its Owner.

On a server, point a domain at it, open ports 80 and 443, and put `ZIFFR_DOMAIN=ziffr.example.com` in a `.env` file next to `compose.yml`. Ziffr is then at `https://ziffr.example.com` with a certificate from Let's Encrypt. Your mail server goes in the same file as `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM`.

Or let the installer ask for the folder, the domain and the mail server:

```sh
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/install.sh | sh
```

The stack makes its own keys on the first start, applies the migrations on every start and calls the two jobs itself, so steps 1 to 5 below are done for you. [docker/README.md](../../docker/README.md) lists every setting, and says how to upgrade and back up an Installation run with Docker.

## With your own Supabase project

Ziffr is a Next.js app on top of a Supabase project (Postgres and its sign-in service). These steps take it from an empty Supabase project to a team using it.

### What you run

| Part | What it is | Needed |
| --- | --- | --- |
| The app | `apps/web`, a Next.js server on Node 22 | yes |
| Supabase | Postgres with Ziffr's migrations, and Supabase Auth for sign-in links and providers | yes, hosted or self-hosted |
| SMTP | Any mail provider, for Prompts, reminders and invitations | strongly advised: without it nothing reaches anyone |
| A scheduler | Calls two jobs, hourly and every few minutes | yes, for Workflows to run and email to be retried |
| Inbound mail | A domain whose mail is forwarded to Ziffr, for replies by email | optional |
| A Slack app | Made from the manifest in the [Slack](slack.md) guide, for messages and answers on Slack | optional |

Ziffr keeps everything in Postgres. The server makes outgoing connections only to Supabase and to your SMTP server.

### 1. The database

1. Create a Supabase project (or run Supabase yourself).
2. Apply Ziffr's migrations from a checkout of the release you run:

   ```sh
   supabase link --project-ref <your project ref>
   supabase db push
   ```

3. If you offer the demo (on unless `ZIFFR_DEMO=0`), fill in its made-up company once, in the SQL editor:

   ```sql
   select demo_reset(interval '0 seconds');
   ```

   The demo sits beside your real workspaces and reaches only its own made-up people ([ADR 0005](../adr/0005-demo-beside-real-accounts.md)). Visitors can reset it from the app at most once a minute.

### 2. Sign-in

In the Supabase dashboard, under Authentication:

- **Site URL:** where Ziffr is reached, the same as `ZIFFR_SITE_URL`, such as `https://ziffr.example.com`.
- **Redirect URLs:** add `https://ziffr.example.com/auth/callback`.
- **Email confirmations:** on. Ziffr counts an address as a person's only when a sign-in proved it.
- **SMTP for sign-in links:** set your own SMTP server. Supabase's built-in sender is meant for trying things out and sends only a few emails an hour.
- **Providers** (optional): Google, Microsoft (azure), GitHub or LinkedIn, each with its client id and secret. List the ones you set up in `ZIFFR_AUTH_PROVIDERS`, comma separated.

Under Project Settings, API, keep **Max Rows** at 1000 or more (1000 is the default). Ziffr reads long lists page by page, 1000 rows at a time; with a lower limit, a list would end early.

### 3. The app's settings

Set these where the app runs. `.env.example` has them all with a comment each.

| Setting | What it is |
| --- | --- |
| `SUPABASE_URL` | Your project's API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | The service role key. Server only: it never reaches a browser, and the build fails if it would |
| `SUPABASE_ANON_KEY` | The public anon key, for sign-in; Row Level Security lets it read nothing. Read when the app starts, so one build serves any project. Before 0.8, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` did this, and they still work |
| `ZIFFR_SITE_URL` | Where Ziffr is reached, with `https://`; links in emails and sign-in lead here |
| `ZIFFR_AUTH_PROVIDERS` | Sign-in providers besides the email link, if any |
| `ZIFFR_DEMO` | `0` to offer no demo |
| `ZIFFR_USER_GUIDE_URL` | Where the app's "User guide" link leads, if your team keeps its guide elsewhere; without it, Ziffr's own guide at `/guide` ([user guide](../user-guide/README.md)) |
| `ZIFFR_USER_GUIDE_DIR` | A folder of guide chapters other than `docs/user-guide`, such as a translated copy, optional |
| `ZIFFR_SMTP_URL`, `ZIFFR_MAIL_FROM` | Sending email ([email](email.md)) |
| `ZIFFR_JOB_SECRET` | The secret your scheduler sends to the jobs, at least 32 characters ([jobs](jobs.md)) |
| `ZIFFR_INBOUND_DOMAIN`, `ZIFFR_INBOUND_SECRET`, `ZIFFR_INBOUND_AUTHSERV_ID` | Replies by email, optional ([email](email.md)) |
| `ZIFFR_PROXY_HOPS` | How many proxies in front of Ziffr add to `X-Forwarded-For` (usually `1`). Lets the sign-in limit count per network address; without it only the per-address limits apply |
| `ZIFFR_SLACK_CLIENT_ID`, `ZIFFR_SLACK_CLIENT_SECRET`, `ZIFFR_SLACK_SIGNING_SECRET`, `ZIFFR_SECRETS_KEY` | Slack, optional ([Slack](slack.md)); back up `ZIFFR_SECRETS_KEY`, which seals the stored bot tokens; `ZIFFR_SECRETS_KEY_PREVIOUS` while changing it ([Slack](slack.md)) |

Keep the secrets in your platform's secret store, never in the repository.

### 4. Build and run

With pnpm and Node 22, from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @ziffr/web build
pnpm --filter @ziffr/web start        # listens on port 3000; set PORT to change it
```

Any host that runs a Node server works: a virtual machine behind a reverse proxy, a container platform, or a Node hosting service pointed at `apps/web`. Serve it over HTTPS only. Behind a proxy that changes the host name, add that name to `serverActions.allowedOrigins` in `apps/web/next.config.ts`, or Next.js refuses the app's forms as coming from another site.

### 5. The scheduler

Call `POST /api/jobs/workflows` every hour and `POST /api/jobs/deliveries` every few minutes, each with `Authorization: Bearer $ZIFFR_JOB_SECRET`. [Scheduled jobs](jobs.md) has example cron lines. Without the first, Workflows never ask anyone; without the second, the emails of the daily run and of reminders sent in bulk are never sent, and a failed email is never tried again.

### 6. The first workspace

Open Ziffr, sign in with an email link, and create a workspace: you are its Owner. On the Team page, set the workspace's time zone and the hour its Workflows run, and invite the others.

## Upgrading

With Docker: [docker/README.md](../../docker/README.md#upgrading). With your own Supabase project:

Releases are tagged `vX.Y.Z`, and each has a section in `CHANGELOG.md` ([ADR 0004](../adr/0004-releases-and-versions.md)). Notes for you start with "Self-hosters:" and come first. To upgrade:

1. Read the sections between your version and the new one.
2. Apply the new migrations: `supabase db push`. They only add, so the old app keeps working until it is replaced.
3. Set any new settings the notes name, then build and start the new version.

## Backups

With Docker, back up the `ziffr_db` and `ziffr_keys` volumes ([docker/README.md](../../docker/README.md#backups)). With your own Supabase project:

All of Ziffr's data is in the Postgres database: Metrics, values, dashboards, decks, Threads and the Access Log. Back it up the way your Supabase plan or your own Postgres does, and try a restore once before you rely on it.

## Before you invite anyone

- [ ] Migrations applied, and `supabase db push` reports nothing left to do (with Docker: `migrate` did it; `docker compose logs migrate`)
- [ ] Supabase Auth: Site URL and the `/auth/callback` redirect set, email confirmations on, your own SMTP for sign-in links (with Docker: set from `ZIFFR_DOMAIN` and `ZIFFR_SMTP_URL`)
- [ ] `ZIFFR_SITE_URL` is the `https://` address people use, and the app is only served over HTTPS
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and every other secret are in a secret store, not in a file in the repository
- [ ] A sign-in link arrives, opens Ziffr and signs you in
- [ ] Email: `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM` set, with SPF and DKIM for the sender's domain; an invitation reaches a test inbox
- [ ] Scheduler: both jobs called with `ZIFFR_JOB_SECRET`; after the run hour, the Workflows page shows a run "by the clock"
- [ ] The demo: filled in with `demo_reset`, or switched off with `ZIFFR_DEMO=0`
- [ ] Replies by email, if used: the inbound domain's MX records, a signed forwarder, and `ZIFFR_INBOUND_AUTHSERV_ID`
- [ ] Slack, if used: the app made from the manifest, its event and interactivity URLs verified by Slack, `ZIFFR_SECRETS_KEY` backed up
- [ ] Decks: the slide editor uses tldraw, which needs a license from tldraw for production use
- [ ] Backups on, and one restore tried (with Docker: both volumes, `ziffr_db` and `ziffr_keys`)
- [ ] The workspace's time zone and run hour set on the Team page
