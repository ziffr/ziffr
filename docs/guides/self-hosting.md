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
| A Telegram bot | Made with @BotFather as the [Telegram](telegram.md) guide says, for messages and answers by Telegram | optional |

Ziffr keeps everything in Postgres. The server makes outgoing connections only to Supabase and to your SMTP server, and to Slack and Telegram once you set them up.

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
- **Sign-in emails through Ziffr** (recommended): under Authentication, Hooks, add a **Send Email** hook of type HTTPS with the address `https://ziffr.example.com/api/auth/send-email`, let Supabase make its secret, and set that secret (`v1,whsec_…`) as `ZIFFR_AUTH_HOOK_SECRET` where Ziffr runs. Ziffr then sends sign-in links with its own mail server, also one saved on the [Installation settings](#installation-settings) page. Without the hook, set your own SMTP server here: Supabase's built-in sender is meant for trying things out and sends only a few emails an hour.
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
| `ZIFFR_DEMO` | `0` to offer no demo, `1` to offer it; or choose on the Installation settings page |
| `ZIFFR_USER_GUIDE_URL` | Where the app's "User guide" link leads, if your team keeps its guide elsewhere; without it, Ziffr's own guide at `/guide` ([user guide](../user-guide/README.md)) |
| `ZIFFR_USER_GUIDE_DIR` | A folder of guide chapters other than `docs/user-guide`, such as a translated copy, optional |
| `ZIFFR_SMTP_URL`, `ZIFFR_MAIL_FROM` | Sending email ([email](email.md)); or set them on the [Installation settings](#installation-settings) page |
| `ZIFFR_ALLOW_PRIVATE_MAIL_HOST` | `1` lets the Installation settings page save a mail server inside this server's network (`localhost`, `10.x`, a Docker service such as `mail`); off by default, so the page cannot reach into your network |
| `ZIFFR_MARKETPLACE`, `ZIFFR_MARKETPLACE_URL` | The Marketplace connection ([Packs](packs.md)): off unless `on`. Ziffr's server, never a browser, asks the Marketplace (Ziffr's own unless the URL says otherwise, https only) for Packs, their files and newer versions, and sends no Workspace's or person's data. Also on the [Installation settings](#installation-settings) page. Without it, Packs are installed from a file |
| `ZIFFR_MARKETPLACE_PUBLIC_KEY` | A Marketplace key Ziffr trusts besides its own (base64 of the raw 32-byte Ed25519 key), for a Marketplace you run yourself; never set on a page |
| `ZIFFR_ALLOW_PRIVATE_MARKETPLACE` | `1` lets the Marketplace address be inside this server's network; off by default |
| `ZIFFR_WEBHOOK_PRIVATE_HOSTS` | Exact host names (comma-separated, no ranges or wildcards) that Ziffr may send webhooks to even though they are inside this server's network, such as a self-hosted n8n. Every other address inside your network stays refused, and only https is used. List only names your own DNS answers: a listed name may reach any address. Only you set it here; a Workspace Admin cannot |
| `ZIFFR_INSTALLATION_ADMINS` | Email addresses of the people who run this Installation, separated by commas, optional: they are Installation Admins without the setup code ([Installation settings](#installation-settings)) |
| `ZIFFR_JOB_SECRET` | The secret your scheduler sends to the jobs, at least 32 characters ([jobs](jobs.md)) |
| `ZIFFR_INBOUND_DOMAIN`, `ZIFFR_INBOUND_SECRET`, `ZIFFR_INBOUND_AUTHSERV_ID` | Replies by email, optional ([email](email.md)) |
| `ZIFFR_PROXY_HOPS` | How many proxies in front of Ziffr add to `X-Forwarded-For` (usually `1`). Lets the sign-in limit count per network address; without it only the per-address limits apply. Also keys the Webhook inbound gate by address: without it unsigned floods share one ceiling per Webhook (600 a minute) and can lock out the real sender until they stop |
| `ZIFFR_REMOTE_MCP` | The remote MCP Server at `<ZIFFR_SITE_URL>/mcp`, for assistants such as Claude.ai. On by default where `ZIFFR_SITE_URL` is https, off otherwise; `1` turns it on, `0` off. Never in a demo-only Ziffr |
| `ZIFFR_TELEGRAM_BOT_TOKEN` (with `ZIFFR_SECRETS_KEY`) | Telegram, optional ([Telegram](telegram.md)); Telegram sends answers to `ZIFFR_SITE_URL`, which must be https |
| `ZIFFR_SLACK_CLIENT_ID`, `ZIFFR_SLACK_CLIENT_SECRET`, `ZIFFR_SLACK_SIGNING_SECRET`, `ZIFFR_SECRETS_KEY` | Slack, optional ([Slack](slack.md)); or set the three Slack values on the [Installation settings](#installation-settings) page, which also makes the app from its manifest; back up `ZIFFR_SECRETS_KEY`, which seals the stored bot tokens; `ZIFFR_SECRETS_KEY_PREVIOUS` while changing it ([Slack](slack.md)) |

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

Open Ziffr, sign in with an email link, and create a workspace: you are its Owner. To run the Installation from the page as well, claim it at `/installation` with the setup code from the log ([Installation settings](#installation-settings)). On the Team page, set the workspace's time zone and the hour its Workflows run, and invite the others.

## Installation settings

Some of what an Installation talks to can be set on a page instead of in the settings file: `/installation`, for its **Installation Admins** only. For now that is the mail server and the sender (`ZIFFR_SMTP_URL`, `ZIFFR_MAIL_FROM`); replies by email, Telegram, Slack, the check against bots, trials and the demo follow. The [user guide](../user-guide/18-installation-settings.md) shows the page.

- **The first Installation Admin.** While there is none, Ziffr writes a one-time setup code to its log at every start, and when someone opens `/installation`. With Docker: `docker compose logs app | grep "setup code"`. Sign in, open `/installation` and enter it; it works once. Anyone who can read the log can claim the Installation, so claim it before you hand out the address. Or name the admins in `ZIFFR_INSTALLATION_ADMINS` and skip the code. With several app servers on one database, each start makes a new code and the older ones stop working: take the code from the log of the server that started last.
- **Which value counts.** The environment first, then the page, then the default (Docker's Mailpit). A setting in the environment is shown on the page as "set on the server" and cannot be changed there, so an Installation set up with a file works as before. A saved value takes effect within seconds, without a restart.
- **Secrets.** The mail server's address holds its password, so it is sealed with `ZIFFR_SECRETS_KEY` before it is stored, and never shown again. Docker makes that key on the first start; elsewhere set it before saving secrets on the page. Back it up with the database: without it, sealed settings no longer open and must be saved again.
- **The mail server's address** is read for its host, port, user and password only, also from the environment: options in a query (`?…`) are ignored, and the page refuses them. A host inside your own network, written so or resolving there, is refused on the page unless `ZIFFR_ALLOW_PRIVATE_MAIL_HOST=1`; Ziffr connects to the address it checked.
- **Sign-in links** go through Ziffr's mail settings too: Supabase Auth hands each one to Ziffr (its Send Email Hook), which Docker sets up by itself. With your own Supabase project, add the hook as above; without it, Auth keeps its own mail settings for sign-in links.
- **The check against bots, trials and the demo** are set up on the page too, as the user guide's Installation settings chapter shows. `ZIFFR_DEMO_ONLY` stays a server setting, since it also stops Supabase Auth from making accounts. With Docker, `ZIFFR_DEMO` in the settings file wins. On a domain the demo is off on the server unless the settings file sets `ZIFFR_DEMO=1`, so the page shows it as set on the server; on a laptop the page may switch it off.
- **Replies by email** are set up on the page too: the domain for replies, a signing secret the page makes for your provider's forwarder (shown once), the provider that vouches for senders, the MX record the domain needs and what it has now, and a test that emails you and waits for your reply to come back.
- **What is recorded.** Claiming, adding and removing Installation Admins, and every change of a setting, by name and never by value, with who did it, in a log the page shows.

## Seeing how your Installation is used

Installation Admins can read daily totals across all Workspaces (counts only, never a name) on the Installation settings page, and bring them into a Workspace of their own as Metrics with the Usage Feed, which is off until you set its two keys. Setup, the settings and what happens when the Installation is down are in the [Usage guide](usage.md).

## Limits per Workspace

Self-hosted Ziffr has no limits unless you set one (spec 0029). A **Workspace Limit** is the most Metrics a Workspace may hold (Archived Metrics and the demo do not count). Set a default for every Workspace with `ZIFFR_DEFAULT_METRICS_LIMIT` and `ZIFFR_DEFAULT_LIMIT_LABEL` (such as 10 and "Free"), or in the **Workspace Limits** section of the Installation settings page, where an Installation Admin also gives one Workspace a limit of its own. Nothing else is limited, and nothing about it is a price: Ziffr itself knows only a number and a name.

- **Over the limit** a Workspace keeps working and every value keeps arriving. The first Metric over the limit starts 14 days in which it may hold 10 % more (at least one); after that no new Metric can be made until it holds fewer than the limit. The database enforces it for every way a Metric is made, so the API, the MCP Server, Feeds, Packs and the forms are all refused alike.
- **`ZIFFR_DEFAULT_LIMIT_PER_PERSON`** (default 3, unset where you do not set a default limit) caps how many Workspaces on the default limit one person may own.
- **Hosted Ziffr only:** `ZIFFR_CLOUD_KEY` and `ZIFFR_CLOUD_URL` let a billing service set limits through a signed API and hand Owners over to it. Leave both unset and neither exists: the endpoints answer 404 and no screen mentions a Size or a price. The API is in the [reference](../reference/cloud-api.md); set `ZIFFR_SITE_URL` too, since the Owners' handover names it.
- Trials that stay, and Workspaces deleted for being unused, are in their own sections below.

## Deleting unused Workspaces

With a default Workspace Limit (spec 0029) and working email, `ZIFFR_DELETE_UNUSED_AFTER_DAYS` (30 to 3650, also on the Installation Settings page) deletes Workspaces on that default that nobody used for that many days: no sign-in and no value by any Source. Their Owners get one warning first; 14 days later, still unused, the Workspace is deleted with its key destroyed, and members whose only Workspace it was go with their sign-in. One sign-in or one value stops it. Trials, the demo and Workspaces with a limit of their own are never touched. The scheduler calls `POST /api/jobs/unused-workspaces` daily ([jobs](jobs.md)); Docker Compose does it at 04:10 UTC. Unset, nothing is deleted.

## Offering trials

A public Ziffr can let anyone try it for real with a **Trial Workspace** of their own ([spec 0021](../specs/0021-trial-workspaces.md), [ADR 0010](../adr/0010-trial-workspaces-reach-only-their-owner.md)). A visitor signs in with their email address and gets one workspace, filled with made-up Metrics, a dashboard and a Workflow that asks them. Email, Slack, Telegram, the API, the MCP Server and Feeds work in it for real, but reach only its Owner; nobody can be invited, Contacts stay simulated, and it sends at most 50 messages a day. It ends after the days you set and is deleted a week later, with its Owner's account. The shared demo stays beside it for people who only want to look.

1. Set `ZIFFR_TRIAL_DAYS` (1 to 30) and, if you like, `ZIFFR_TRIAL_MAX` (default 200), or set them in the **Trials** section of the [Installation settings](#installation-settings) page. Leave `ZIFFR_DEMO_ONLY` unset; with Docker on a domain, offer the demo with `ZIFFR_DEMO=1` or in the page's **Demo** section. Every workspace made on this Ziffr is then a trial, so use an Installation of its own, never one your team works in.
2. Set up Cloudflare Turnstile: make a widget for your domain in the Cloudflare dashboard (Turnstile, Add widget, mode Managed) and set `ZIFFR_TURNSTILE_SITE_KEY` and `ZIFFR_TURNSTILE_SECRET`, or save them in the page's **Check against bots** section, which asks Cloudflare whether it knows the secret first. With your own Supabase project, also turn on its bot protection (Auth, Bot protection, Turnstile) with the same secret, since Supabase's sign-in endpoint can be called without Ziffr.
3. Real email: set `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM` for a mail provider that allows this volume, and replies by email ([email guide](email.md)) if you want them. Without a mail server, trials still work and say that email is simulated.
4. Slack, if you want it: set up the app ([Slack guide](slack.md)) and, under Manage Distribution, turn on public distribution, so any Slack workspace can add it. It does not need to be listed in the Slack Marketplace.
5. Telegram, if you want it: one bot for the Installation ([Telegram guide](telegram.md)).
6. The scheduler must call `POST /api/jobs/trial-cleanup` every hour ([jobs](jobs.md)); Docker Compose does it, and the job answers 404 while no trials are offered.

To keep trials instead of deleting them, as hosted Ziffr does, set `ZIFFR_TRIAL_THEN=keep` (or **When a trial ends** on the Installation Settings page) together with a default Workspace Limit (`ZIFFR_DEFAULT_METRICS_LIMIT`, `ZIFFR_DEFAULT_LIMIT_LABEL`; spec 0029). At its end a trial then becomes an ordinary Workspace on that limit: invitations open, its Connectors reach everyone, its keys keep the end date they were made with, and if it holds more Metrics than the limit the 14 days over it start. `ZIFFR_ONE_DEFAULT_PER_PERSON=1` lets each person own only one Workspace on the default limit, so nobody collects free Workspaces; a Workspace with a limit of its own does not count. A value of `ZIFFR_TRIAL_THEN` other than `delete` or `keep` stops trials from ending until it is fixed.

The sign-in page then shows the trial next to the demo, with what works in a trial on this Ziffr and what it asks for. A setting that is set but wrong (`ZIFFR_TRIAL_DAYS=14d`) stops workspaces from being made rather than offering ordinary ones.

## Upgrading

With Docker: [docker/README.md](../../docker/README.md#upgrading). With your own Supabase project:

Releases are tagged `vX.Y.Z`, and each has its notes on the [Releases page](https://github.com/ziffr/ziffr/releases) ([ADR 0014](../adr/0014-a-release-is-a-tag-on-main.md); versions up to 0.11.0 are in `CHANGELOG.md`). Notes for you are under "For self-hosters" and come first. To upgrade:

1. Read the notes of every release between your version and the new one.
2. Apply the new migrations: `supabase db push`. They only add, so the old app keeps working until it is replaced.
3. Set any new settings the notes name, then build and start the new version.

## Backups

With Docker, back up the `ziffr_db` and `ziffr_keys` volumes ([docker/README.md](../../docker/README.md#backups)). With your own Supabase project:

All of Ziffr's data is in the Postgres database: Metrics, values, dashboards, decks, Threads and the Access Log. Back it up the way your Supabase plan or your own Postgres does, and try a restore once before you rely on it.

**Encrypting what was written before.** Since spec 0028 every Workspace has a Workspace Key and new data is sealed with it. Data written before is sealed by a job, `POST /api/jobs/workspace-keys` ([scheduled jobs](jobs.md)), a few hundred rows at a time; Docker Compose's clock calls it every five minutes, elsewhere call it from your scheduler. Nothing stops while it runs, and it needs no setting beyond `ZIFFR_SECRETS_KEY`: without that key it waits. Watch it on the Installation settings page, under Encryption of Workspaces. **Back up `ZIFFR_SECRETS_KEY` (with Docker, the `ziffr_keys` volume) apart from the database before you upgrade:** once data is sealed, losing the key loses every Workspace, with no way back. A dump stored next to the key protects nothing.

**Deleted Workspaces and backups.** Deleting a Workspace, such as a trial that ended, destroys its Workspace Key first (spec 0028). Once a Workspace's data is sealed with that key (from spec 0028's step 1 on), the live database and every backup taken afterwards cannot open what is left of it. A backup taken before the deletion still holds the wrapped key, and `ZIFFR_SECRETS_KEY` still unwraps it, so that backup opens until it is itself deleted. A deleted Workspace is therefore unreadable in backups after the retention period: tell people your retention period (N days), and promise nothing stronger.

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
