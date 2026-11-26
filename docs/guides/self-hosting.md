# Running Ziffr yourself

Ziffr is source-available: you can run it yourself, for your team, on your own machines. There are two ways:

- **With Docker** (start here): one file, two commands, everything inside. [Docker](#with-docker) below and [docker/README.md](../../docker/README.md).
- **With your own Supabase project**: if you already run Supabase or want a hosted one, the app on a Node server of your choice. [The steps](#with-your-own-supabase-project) below.

Both end with the same [checklist](#before-you-invite-anyone). The [scheduled jobs](jobs.md) and [email](email.md) guides cover those two parts in more depth.

## With Docker

You need Docker with Compose 2.24 or newer, and about 1 GB of free memory.

```sh skip="installs Ziffr with Docker"
curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/compose.yml -o compose.yml
docker compose up -d
```

Open http://localhost, sign in with your email address (without a mail server the link lands in Mailpit, at http://localhost:8025), and create a workspace: you are its Owner.

On a server, point a domain at it, open ports 80 and 443, and put `ZIFFR_DOMAIN=ziffr.example.com` in a `.env` file next to `compose.yml`. Ziffr is then at `https://ziffr.example.com` with a certificate from Let's Encrypt. Your mail server goes in the same file as `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM`.

Or let the installer ask for the folder, the domain and the mail server:

```sh skip="installs Ziffr with Docker"
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
| A Telegram bot | Made with @BotFather as the [Telegram](telegram.md) guide says, for messages and answers by Telegram. Ziffr's [logo and chat pictures](../brand/README.md) are there to upload | optional |

Ziffr keeps everything in Postgres. The server makes outgoing connections only to Supabase and to your SMTP server, and to Slack and Telegram once you set them up.

### 1. The database

1. Create a Supabase project (or run Supabase yourself).
2. Apply Ziffr's migrations from a checkout of the release you run:

   ```sh skip="needs a Supabase project of your own"
   supabase link --project-ref <your project ref>
   supabase db push
   ```

3. If you offer the demo (on unless `ZIFFR_DEMO=0`), fill in its made-up company once, in the SQL editor:

   ```sql
   select demo_reset(interval '0 seconds');
   select prototype_seed_history();
   select prototype_seed_pins();
   select prototype_seed_close();
   select prototype_seed_fill_in();
   select prototype_seed_calculation_notes();
   select prototype_seed_showcase();
   ```

   The demo sits beside your real workspaces and reaches only its own made-up people ([ADR 0005](../adr/0005-demo-beside-real-accounts.md)). The demo is seeded again by the reset job (`POST /api/jobs/demo-reset`, [Scheduled jobs](jobs.md#the-demos-reset)), which does so at most once a minute; nothing in the app resets it for a visitor. To let visitors change it, see [Running a public demo that visitors may change](#running-a-public-demo-that-visitors-may-change).

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
| `ZIFFR_DEMO_ONLY` | `1` makes this Ziffr a public demo and nothing else: nobody signs in or makes an account, and the sign-in page offers only the demo |
| `ZIFFR_DEMO_ADDRESS_KEY` | Only where visitors may change the demo (`ZIFFR_DEMO_CHANGES`, in effect only with `ZIFFR_DEMO_ONLY=1`): a secret of at least 32 characters (`openssl rand -hex 32`) under which changes are counted per network address. See [Running a public demo that visitors may change](#running-a-public-demo-that-visitors-may-change) |
| `ZIFFR_FEEDBACK_PROMPT` | `true` to ask signed-in people now and then whether they like Ziffr (with a link to the repository on GitHub), `false` never; off unless set, on for hosted Ziffr; or choose on the Installation settings page |
| `ZIFFR_FEEDBACK_PER_DAY` | The most feedback the whole Installation takes in 24 hours, central version (ziffr.net) only; 20 to 100,000, `200` unless set; or choose on the Installation settings page |
| `ZIFFR_USER_GUIDE_URL` | Where the app's "User guide" link leads, if your team keeps its guide elsewhere; without it, Ziffr's own guide at `/guide` ([user guide](../user-guide/README.md)) |
| `ZIFFR_USER_GUIDE_DIR` | A folder of guide chapters other than `docs/user-guide`, such as a translated copy, optional |
| `ZIFFR_SMTP_URL`, `ZIFFR_MAIL_FROM` | Sending email ([email](email.md)); or set them on the [Installation settings](#installation-settings) page |
| `ZIFFR_ALLOW_PRIVATE_MAIL_HOST` | `1` lets the Installation settings page save a mail server inside this server's network (`localhost`, `10.x`, a Docker service such as `mail`); off by default, so the page cannot reach into your network |
| `ZIFFR_MARKETPLACE`, `ZIFFR_MARKETPLACE_URL` | The Marketplace connection ([Packs](packs.md)): off unless `on`. Ziffr's server, never a browser, asks the Marketplace (Ziffr's own unless the URL says otherwise, https only) for Packs, their files and newer versions, and sends no Workspace's or person's data. Also on the [Installation settings](#installation-settings) page. Without it, Packs are installed from a file |
| `ZIFFR_MARKETPLACE_PUBLIC_KEY` | A Marketplace key Ziffr trusts besides its own (base64 of the raw 32-byte Ed25519 key), for a Marketplace you run yourself; never set on a page |
| `ZIFFR_ALLOW_PRIVATE_MARKETPLACE` | `1` lets the Marketplace address be inside this server's network; off by default |
| `ZIFFR_WEBHOOK_PRIVATE_HOSTS` | Exact host names (comma-separated, no ranges or wildcards) that Ziffr may send webhooks to even though they are inside this server's network, such as a self-hosted n8n. Every other address inside your network stays refused, and only https is used. List only names your own DNS answers: a listed name may reach any address. The list never applies to a trial. Only you set it here; a Workspace Admin cannot |
| `ZIFFR_INSTALLATION_ADMINS` | Email addresses of the people who run this Installation, separated by commas, optional: they are Installation Admins without the setup code ([Installation settings](#installation-settings)) |
| `ZIFFR_JOB_SECRET` | The secret your scheduler sends to the jobs, at least 32 characters ([jobs](jobs.md)) |
| `ZIFFR_INBOUND_DOMAIN`, `ZIFFR_INBOUND_SECRET`, `ZIFFR_INBOUND_AUTHSERV_ID` | Replies by email, optional ([email](email.md)). Without `ZIFFR_INBOUND_AUTHSERV_ID`, no provider vouches for senders, so each reply is held until the person confirms it with a one-time link emailed to the address on file (a forged sender never sees the link); the Installation Settings page says so while it is empty |
| `ZIFFR_PROXY_HOPS` | How many proxies in front of Ziffr add to `X-Forwarded-For` (usually `1`). Lets the sign-in limit count per network address; without it only the per-address limits apply. A public demo that visitors may change needs it, and `ZIFFR_DEMO_ADDRESS_KEY` beside it: see [Running a public demo that visitors may change](#running-a-public-demo-that-visitors-may-change). Also lets the Webhook inbound gate count failed requests per address and remember real senders: without it a flood of failed requests past 600 a minute locks out the real sender until it stops |
| `ZIFFR_REMOTE_MCP` | The remote MCP Server at `<ZIFFR_SITE_URL>/mcp`, for assistants such as Claude.ai. On by default where `ZIFFR_SITE_URL` is https, off otherwise; `1` turns it on, `0` off. Never in a demo-only Ziffr |
| `ZIFFR_TELEGRAM_BOT_TOKEN` (with `ZIFFR_SECRETS_KEY`) | Telegram, optional ([Telegram](telegram.md)); Telegram sends answers to `ZIFFR_SITE_URL`, which must be https |
| `ZIFFR_SLACK_CLIENT_ID`, `ZIFFR_SLACK_CLIENT_SECRET`, `ZIFFR_SLACK_SIGNING_SECRET`, `ZIFFR_SECRETS_KEY` | Slack, optional ([Slack](slack.md)); or set the three Slack values on the [Installation settings](#installation-settings) page, which also makes the app from its manifest; back up `ZIFFR_SECRETS_KEY`, which seals the stored bot tokens; `ZIFFR_SECRETS_KEY_PREVIOUS` while changing it ([Slack](slack.md)) |

Keep the secrets in your platform's secret store, never in the repository.

### 4. Build and run

With pnpm and Node 22, from the repository root:

```sh skip="builds and starts the app; CI already does this before the examples run"
pnpm install --frozen-lockfile
pnpm --filter @ziffr/web build
pnpm --filter @ziffr/web start        # listens on port 3000; set PORT to change it
```

Any host that runs a Node server works: a virtual machine behind a reverse proxy, a container platform, or a Node hosting service pointed at `apps/web`. Serve it over HTTPS only. Behind a proxy that changes the host name, add that name to `serverActions.allowedOrigins` in `apps/web/next.config.ts`, or Next.js refuses the app's forms as coming from another site.

### 5. The scheduler

Call `POST /api/jobs/workflows` every hour and `POST /api/jobs/deliveries` every few minutes, each with `Authorization: Bearer $ZIFFR_JOB_SECRET`. [Scheduled jobs](jobs.md) has example cron lines. Without the first, Workflows never ask anyone; without the second, the emails of the daily run and of reminders sent in bulk are never sent, and a failed email is never tried again.

### 6. The first workspace

Open Ziffr, sign in with an email link, and create a workspace: you are its Owner. To run the Installation from the page as well, claim it at `/installation` with the setup code from the log ([Installation settings](#installation-settings)). On the Team page, set the workspace's time zone and the hour its Workflows run, and invite the others.

A new Workspace opens on the Setup Guide ([Getting started](../user-guide/07-getting-started.md#the-setup-guide)), which asks for the time zone and the hour in its first step, and needs nothing from outside your server. Ziffr's own twelve Packs come with the image (and with a build from source), so **Workspace → Packs → Ziffr's own Packs** installs them with no download and no Marketplace. A way your server lacks (a mail server, a Slack app, a Telegram bot) is said in words in the guide's **Ways in and out** step, with a link to the [Installation settings](#installation-settings) for whoever runs it; the web form and paste still let the first Metric finish.

## Installation settings

Some of what an Installation talks to can be set on a page instead of in the settings file: `/installation`, for its **Installation Admins** only. For now that is the mail server and the sender (`ZIFFR_SMTP_URL`, `ZIFFR_MAIL_FROM`); replies by email, Telegram, Slack, the check against bots, trials and the demo follow. The [user guide](../user-guide/18-installation-settings.md) shows the page.

- **The first Installation Admin.** While there is none, Ziffr writes a one-time setup code to its log at every start, and when someone opens `/installation`. With Docker: `docker compose logs app | grep "setup code"`. Sign in, open `/installation` and enter it; it works once. Anyone who can read the log can claim the Installation, so claim it before you hand out the address. Or name the admins in `ZIFFR_INSTALLATION_ADMINS` and skip the code. With several app servers on one database, each start makes a new code and the older ones stop working: take the code from the log of the server that started last.
- **Which value counts.** The environment first, then the page, then the default (Docker's Mailpit). A setting in the environment is shown on the page as "set on the server" and cannot be changed there, so an Installation set up with a file works as before. A saved value takes effect within seconds, without a restart.
- **Secrets.** The mail server's address holds its password, so it is sealed with `ZIFFR_SECRETS_KEY` before it is stored, and never shown again. Docker makes that key on the first start; elsewhere set it before saving secrets on the page. Back it up with the database: without it, sealed settings no longer open and must be saved again. The public addresses of Theme logos are keyed with it too: changing it changes every one, so a logo linked elsewhere (a Slack message, a View Link page already open) stops loading until the message or page is made again. Emails embed the logo and keep it.
- **The mail server's address** is read for its host, port, user and password only, also from the environment: options in a query (`?…`) are ignored, and the page refuses them. A host inside your own network, written so or resolving there, is refused on the page unless `ZIFFR_ALLOW_PRIVATE_MAIL_HOST=1`; Ziffr connects to the address it checked.
- **Sign-in links** go through Ziffr's mail settings too: Supabase Auth hands each one to Ziffr (its Send Email Hook), which Docker sets up by itself. With your own Supabase project, add the hook as above; without it, Auth keeps its own mail settings for sign-in links.
- **The check against bots and the demo** are set up on the page too, as the user guide's Installation settings chapter shows. `ZIFFR_DEMO_ONLY` stays a server setting, since it also stops Supabase Auth from making accounts. With Docker, `ZIFFR_DEMO` in the settings file wins. On a domain the demo is off on the server unless the settings file sets `ZIFFR_DEMO=1`, so the page shows it as set on the server; on a laptop the page may switch it off.
- **Replies by email** are set up on the page too: the domain for replies, a signing secret the page makes for your provider's forwarder (shown once), the provider that vouches for senders, the MX record the domain needs and what it has now, and a test that emails you and waits for your reply to come back.
- **What is recorded.** Claiming, adding and removing Installation Admins, and every change of a setting, by name and never by value, with who did it, in a log the page shows.

## Seeing how your Installation is used

Installation Admins can read daily totals across all Workspaces (counts only, never a name) on the Installation settings page, and bring them into a Workspace of their own as Metrics with the Usage Feed, which is off until you set its two keys. Setup, the settings and what happens when the Installation is down are in the [Usage guide](usage.md).

## Limits per Workspace

Self-hosted Ziffr has no limits unless you set one (spec 0029). A **Workspace Limit** is the most Metrics a Workspace may hold (Archived Metrics and the demo do not count). Set a default for every Workspace with `ZIFFR_DEFAULT_METRICS_LIMIT` and `ZIFFR_DEFAULT_LIMIT_LABEL` (such as 10 and "Standard"), or in the **Workspace Limits** section of the Installation settings page, where an Installation Admin also gives one Workspace a limit of its own. Nothing else is limited, and nothing about it is a price: Ziffr itself knows only a number and a name.

- **Over the limit** a Workspace keeps working and every value keeps arriving. The first Metric over the limit starts 14 days in which it may hold 10 % more (at least one); after that no new Metric can be made until it holds fewer than the limit. The database enforces it for every way a Metric is made, so the API, the MCP Server, Feeds, Packs and the forms are all refused alike.
- **`ZIFFR_DEFAULT_LIMIT_PER_PERSON`** (default 3, unset where you do not set a default limit) caps how many Workspaces on the default limit one person may own.
- **Hosted Ziffr only:** `ZIFFR_CLOUD_KEY` and `ZIFFR_CLOUD_URL` let a billing service set limits through a signed API and hand Owners over to it. Leave both unset and neither exists: the endpoints answer 404 and no screen mentions a Size or a price. The API is in the [reference](../reference/cloud-api.md); set `ZIFFR_SITE_URL` too, since the Owners' handover names it.
- Workspaces deleted for being unused are in their own section below. Trials are hosted Ziffr's ([below](#trials-are-hosted-ziffrs)).

### Every Installation Setting

Generated from the Installation Settings catalogue (`packages/core/src/installation-catalogue.ts`), the same list the page shows; `pnpm test` fails when it is out of date.

<!-- generated:installation-settings -->
**Mail**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_SMTP_URL` | Mail server | secret | The SMTP server, with its user and password: smtps:// for port 465, smtp:// for 587 or 25. |
| `ZIFFR_MAIL_FROM` | Sender | `Ziffr <ziffr@example.com>` | The address emails come from, with a name if you like. Your mail server must be allowed to send as it. |

**Replies by email**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_INBOUND_DOMAIN` | Domain for replies | `in.ziffr.example.com` | The domain replies go to; its MX record points at your inbound mail provider. |
| `ZIFFR_INBOUND_SECRET` | Signing secret | secret | Signs what the provider forwards to Ziffr; 32 characters or more. |
| `ZIFFR_INBOUND_AUTHSERV_ID` | Provider that vouches for senders | `mx.example.com` | The name your provider writes in Authentication-Results; with it, replies from vouched-for senders are taken at once; any other reply waits for the person to confirm it by a link. |

**Telegram**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_TELEGRAM_BOT_TOKEN` | Bot token | secret | Make a bot with @BotFather in Telegram (/newbot) and paste the token it gives you. Ziffr checks it with Telegram and tells Telegram where to send answers. |

**Slack**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_SLACK_CLIENT_ID` | Client ID | `1234567890.1234567890` | On the app's Basic Information page in Slack, under App Credentials. |
| `ZIFFR_SLACK_CLIENT_SECRET` | Client Secret | secret | Under App Credentials too: choose Show and copy it. |
| `ZIFFR_SLACK_SIGNING_SECRET` | Signing Secret | secret | Under App Credentials too. Slack signs every request it sends Ziffr with it. |

**Workspace Limits**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_DEFAULT_METRICS_LIMIT` | Default limit | `No limit` | The most Metrics a Workspace may hold unless it has a limit of its own. Empty: no limit. Over it, a Workspace keeps everything and keeps collecting values; only new Metrics wait, after 14 days with room for 10 % more. |
| `ZIFFR_DEFAULT_LIMIT_LABEL` | Name of the default | `Standard` | What Owners and Admins see the default called, such as Standard. At most 30 characters. |
| `ZIFFR_DELETE_UNUSED_AFTER_DAYS` | Delete unused Workspaces after | `Never` | Days without a sign-in and without values after which a Workspace on the default limit is warned; 14 days after the warning, still unused, it is deleted with its key. 30 to 3650; empty: never. Never a trial, the demo or a Workspace with a limit of its own. |
| `ZIFFR_LIMIT_GRACE_DAYS` | Days over the limit | `14` | 0 to 90. How long a Workspace may stay over its limit, within 10 % more, before new Metrics wait. 0: the limit holds at once. |
| `ZIFFR_LIMIT_GRACE_EVERY_DAYS` | Days between two such periods | `90` | 0 to 730. After a Workspace's days over the limit started, this many days must pass before it gets others. 0: a Workspace gets them again whenever it comes back under its limit. |
| `ZIFFR_UNUSED_WAIT_DAYS` | Days from warning to deletion | `14` | 7 to 90. How long after its warning an unused Workspace is deleted. The days promised in a warning that went out stay as they were told. |

**Sending limits**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_LIMIT_EMAILS_PER_WORKSPACE_PER_DAY` | Emails per Workspace per day | `500` | The emails one Workspace may send in 24 hours; the rest wait in the queue. A small mail provider may allow a few hundred in all. 50 to 100,000; empty: 500. |
| `ZIFFR_LIMIT_CHAT_MESSAGES_PER_WORKSPACE_PER_DAY` | Telegram and Slack messages per Workspace per day | `500` | The same cap for each of the two: a Workspace may send this many Telegram messages and this many Slack messages in 24 hours. The providers' own limits stay below it. 50 to 50,000; empty: 500. |
| `ZIFFR_LIMIT_EMAILS_PER_PERSON_PER_DAY` | Emails per person per day | `300` | The emails one person may cause in 24 hours as the sender of requests, questions and notices, over all their Workspaces. 20 to 5,000; empty: 300. |
| `ZIFFR_LIMIT_SEND_ATTEMPTS` | Tries per message | `5` | How often a queued email, Telegram or Slack message is tried before it counts as failed. A flaky mail server may need more. 1 to 10; empty: 5. |
| `ZIFFR_LIMIT_ALERTS_PER_WORKSPACE` | Alerts per Workspace | `500` | The most Alerts one Workspace may hold in all. Those it holds above a lowered number stay. 50 to 10,000; empty: 500. |
| `ZIFFR_LIMIT_ALERT_MESSAGES_PER_WORKSPACE_PER_DAY` | Alert messages per Workspace per day | `2000` | The messages Alerts may send for one Workspace in a day, over all channels. After it Alerts still fire into the list; only the messages wait for tomorrow. 100 to 100,000; empty: 2,000. |
| `ZIFFR_LIMIT_INVITATION_EMAILS_PER_WORKSPACE_PER_DAY` | Invitation emails per Workspace per day | `50` | The invitation emails one Workspace may send in 24 hours. Each person may still send at most 50 a day. 10 to 2,000; empty: 50. |
| `ZIFFR_LIMIT_VALUES_PER_KEY_PER_DAY` | Values per API key per day | `1000` | The values one API key may submit in 24 hours. A program that sends every minute for 20 Metrics sends 28,800 a day. 100 to 1,000,000; empty: 1,000. |
| `ZIFFR_LIMIT_VALUES_PER_FEED_PER_DAY` | Values per Feed per day | `10000` | The values one Feed may record in 24 hours over all its keys. A person pasting values is held to the same number. 1,000 to 10,000,000; empty: 10,000. |
| `ZIFFR_LIMIT_CALLS_PER_KEY_PER_MINUTE` | Calls per API key per minute | `60` | The calls one API key may make in any 60 seconds. 30 to 6,000; empty: 60. |
| `ZIFFR_LIMIT_WEBHOOKS_PER_WORKSPACE` | Webhooks per Workspace | `5` | The Webhooks one Workspace may hold. A Workspace that holds more than a lowered number keeps them; only new ones wait. 1 to 50; empty: 5. |
| `ZIFFR_LIMIT_WEBHOOK_SENDS_PER_WORKSPACE_PER_DAY` | Webhook sends per Workspace per day | `10000` | The sends a Workspace's Webhooks make in a day; past it they wait for tomorrow. 100 to 1,000,000; empty: 10,000. |
| `ZIFFR_LIMIT_SIGN_IN_LINKS_PER_NETWORK_PER_HOUR` | Sign-in links per network address per hour | `20` | The sign-in links one network address may ask for in an hour, for any addresses. A company or school behind one address, all signing in at nine on Monday, needs more. 5 to 500; empty: 20. |
| `ZIFFR_LIMIT_CONTACTS_PER_WORKSPACE` | Contacts per Workspace | `1000` | The Contacts one Workspace keeps at most. 100 to 100,000; empty: 1,000. |
| `ZIFFR_LIMIT_SNAPSHOTS_PER_DASHBOARD` | Snapshots per dashboard | `500` | The Snapshots one dashboard keeps at most. 100 to 50,000; empty: 500. |
| `ZIFFR_LIMIT_ALERTS_PER_PERSON` | Alerts per person | `20` | The most Alerts one person may hold in one Workspace. This is the ceiling: a Workspace's Owners may lower it for their Workspace, never raise it. Alerts held above a lowered number stay. 1 to 200; empty: 20. |
| `ZIFFR_LIMIT_ALERT_MESSAGES_PER_PERSON_PER_DAY` | Alert messages per person per day | `20` | The Alert messages one person is sent in a day; after it Alerts still fire into the list. This is the ceiling: a Workspace's Owners may lower it, and each person may lower it for themselves, never raise it. 1 to 200; empty: 20. |

**How long logs are kept**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_KEEP_AUDIT_DAYS` | Days the Audit Log is kept | `730` | 365 to 3,650 (730 is two years). The Audit Log says who changed who may see or do what; below 730 days it is a weaker record. Never shorter than the age of an event that a Retention or an Approval still refers to. |
| `ZIFFR_KEEP_ACCESS_LOG_DAYS` | Days the log of calls by key is kept | `90` | 7 to 730. Which key called which address, and when. Shorter is more private; longer lets you answer for access a year back. |
| `ZIFFR_KEEP_WEBHOOK_LOG_DAYS` | Days the Webhook send log is kept | `14` | 1 to 90. The log an Owner reads to find out why a Webhook did not arrive. Shorter saves disk; longer gives time to find out why a partner stopped answering. |
| `ZIFFR_KEEP_VIEW_COUNT_DAYS` | Days View Counts are kept | `400` | 90 to 800. How often a dashboard, a deck or a Metric was opened per day, never by whom. Over a year lets you compare a quarter with last year's. |
| `ZIFFR_RETENTION_VALUES_PER_RUN` | Values one Retention takes a night | `5000` | 500 to 100,000. The most original values one Metric's Retention condenses in a night. Years of values take weeks to catch up at 5,000; more is more work for the database at night. |

**Marketplace**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_MARKETPLACE` | Connection | `off` | on lets this server talk to the Marketplace; off, or empty, makes no connection. Packs can always be installed from a file. |
| `ZIFFR_MARKETPLACE_URL` | Marketplace address | `https://marketplace.ziffr.net` | Where the Marketplace is; empty: Ziffr's own. https only, and never inside this server's own network. |

**Check against bots**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_TURNSTILE_SITE_KEY` | Site key | `0x4AAAAAAA…` | In the Cloudflare dashboard, under Turnstile, add a widget for this Ziffr's domain (mode Managed) and copy its site key. It must be the same widget's as the secret key: a wrong one stops every sign-in until it is removed. |
| `ZIFFR_TURNSTILE_SECRET` | Secret key | secret | The widget's secret key. Ziffr asks Cloudflare whether it knows it before saving it. |

**Trial Limits**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_TRIAL_DAYS` | Days a trial lasts | `14` | Set, it turns trials on: whoever signs in may start a Trial Workspace, and every Workspace made here is one. Hosted Ziffr offers trials with 14 days unless set; Ziffr Cloud sets 0 (null in its API) to switch trials off, and trials that run go on until they end. Applies to trials made afterwards. 1 to 30; empty: 14. |
| `ZIFFR_TRIAL_GRACE_DAYS` | Days a trial's data stays after it ends | `7` | After the trial ends nothing can be added, and its Owner can still download everything; then it is deleted. Applies to every trial that has ended and is waiting, too: a smaller number deletes them sooner. 1 to 60; empty: 7. |
| `ZIFFR_TRIAL_MAX` | Trials at once | `500` | The most trials that may run at the same time. 1 to 100,000; empty: 500. |
| `ZIFFR_TRIAL_LIMIT_PEOPLE` | People in a trial | `5` | The people one trial holds: Members, Admins and Guests, the Owner and the invitations that are still open included. 1 to 25; empty: 5. |
| `ZIFFR_TRIAL_LIMIT_INVITATIONS_PER_DAY` | Invitation emails a trial sends a day | `10` | The invitation emails one trial sends in 24 hours, resends included. The rest of the invitations stay as links the Owner sends themselves. 0: trials send none. 0 to 50; empty: 10. |
| `ZIFFR_TRIAL_LIMIT_INVITATIONS_ALL_PER_DAY` | Invitation emails all trials send a day | `500` | The invitation emails all trials together send in 24 hours: the lever against a campaign that mails strangers. 0: trials send none. 0 to 5,000; empty: 500. |
| `ZIFFR_TRIAL_LIMIT_METRICS` | Metrics | `25` | The Metrics one trial may hold, Archived Metrics included. 5 to 100; empty: 25. |
| `ZIFFR_TRIAL_LIMIT_MESSAGES_PER_DAY` | Messages a trial sends a day | `100` | The real messages one trial sends in 24 hours, over email, Slack and Telegram together. The rest wait in the Outbox. 10 to 500; empty: 100. |
| `ZIFFR_TRIAL_LIMIT_KEYS` | Access Keys that work | `2` | The Access Keys of people that work at the same time in one trial, never past the trial's last day. 1 to 10; empty: 2. |
| `ZIFFR_TRIAL_LIMIT_FEEDS` | Feeds, and Feed Keys per Feed | `2` | The Feeds one trial may have, and the Feed Keys that work on each of them. 1 to 10; empty: 2. |
| `ZIFFR_TRIAL_LIMIT_ASSISTANTS` | Connected assistants | `1` | The assistants (Claude and others, through the MCP Server) that may work at the same time in one trial. 1 to 5; empty: 1. |
| `ZIFFR_TRIAL_LIMIT_WEBHOOKS` | Webhooks | `2` | The Webhooks one trial may hold, Workspace and personal together. 0: trials cannot add any. 0 to 10; empty: 2. |
| `ZIFFR_TRIAL_LIMIT_WEBHOOK_SENDS_PER_DAY` | Webhook sends a trial makes a day | `200` | The sends a trial's Webhooks make in 24 hours; past it they wait for tomorrow. 10 to 1,000; empty: 200. |
| `ZIFFR_TRIAL_LIMIT_VIEW_LINKS` | View Links that work | `5` | The View Links that work at the same time in one trial. 0: trials cannot make any. 0 to 20; empty: 5. |

**Usage**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_USAGE_EXCLUDE_WORKSPACE` | Workspace left out | `None` | One Workspace, usually your own for the numbers, that is left out of every figure and of the count of Workspaces. Pick it by name; the setting holds its id. |

**Feedback**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_FEEDBACK_PROMPT` | Ask people whether they like Ziffr | `true`, `false` | A small card, at most three times per person, after they have submitted values on a few different days; never in the demo, for Guests or on View Links. Empty: on for hosted Ziffr, off everywhere else. |
| `ZIFFR_FEEDBACK_MODE` | Feedback from people | `direct`, `review` | The central version (ziffr.net) only. Post directly (the default): each feedback is filed on GitHub as it arrives. Review first: each waits in the review queue until a maintainer approves it, edits it or rejects it with a reason. A change applies to new feedback; what already waits stays waiting. |
| `ZIFFR_FEEDBACK_PER_DAY` | Feedback the whole Installation takes a day | `200` | The most feedback all people together may send in 24 hours, in the central version (ziffr.net) only. Over it, new feedback is refused with a plain message until the day has passed, so many new accounts cannot fill the queue before real feedback is read. 20 to 100,000; empty: 200. |

**Demo**

| Setting | On the page | Example or choices | What it does |
| --- | --- | --- | --- |
| `ZIFFR_DEMO` | Offer the demo | `1`, `0` | Whether the login page has Try the demo. |
| `ZIFFR_DEMO_CHANGES` | Visitors may change the demo | `1`, `0` | Only in a demo-only Ziffr (ZIFFR_DEMO_ONLY on the server). What visitors change is seen by every visitor and gone when the demo starts fresh, every 15 minutes. Off, or in any other Ziffr, the demo is read-only. |
<!-- /generated:installation-settings -->

## Sending limits

The abuse safeguards (emails and chat messages per Workspace and person per day, Alerts, values and calls per API key, Webhooks, sign-in links per network address, Contacts, Snapshots) have normal values that suit most Installations. Move one within its range with a `ZIFFR_LIMIT_*` variable (all are listed in `.env.example`) or in the **Sending limits** section of the Installation Settings page; a variable wins. A small mail provider may need the emails per day lowered, a busy Feed the values per day raised. None can be switched off: a value outside its range is refused on the page and ignored in the environment. Lowering one never deletes or stops what exists, and a change takes effect within seconds. They are the same for every Workspace. The user guide, chapter 18, has every range.
## How long logs are kept, and the days around limits and trials

These are Installation Settings (spec 0025, ticket #517), on the page and in the environment; the environment wins. A value outside its range is ignored and the default applies. `ZIFFR_KEEP_AUDIT_DAYS` (365 to 3650, default 730) is the Audit Log; it is never kept for fewer days than a Retention or an Approval still refers to, the page refuses a lower number, and the database never removes an event younger than a year. `ZIFFR_KEEP_ACCESS_LOG_DAYS` (7 to 730, default 90), `ZIFFR_KEEP_WEBHOOK_LOG_DAYS` (1 to 90, default 14), `ZIFFR_KEEP_VIEW_COUNT_DAYS` (90 to 800, default 400) and `ZIFFR_RETENTION_VALUES_PER_RUN` (500 to 100000, default 5000) are the other log lengths and the nightly Retention budget. `ZIFFR_LIMIT_GRACE_DAYS` (0 to 90, default 14), `ZIFFR_LIMIT_GRACE_EVERY_DAYS` (0 to 730, default 90), `ZIFFR_TRIAL_GRACE_DAYS` (1 to 60, default 7, a Trial Limit) and `ZIFFR_UNUSED_WAIT_DAYS` (7 to 90, default 14) set the days over a Workspace Limit, between two such periods, a trial's data stays after its end, and from the warning of an unused Workspace to its deletion. On a Ziffr Cloud deployment (`ZIFFR_CLOUD_KEY` set) the Workspace Limits, these four and the trial and unused-Workspace days are fixed by Ziffr Cloud; the page shows them as set by Ziffr Cloud.

## Deleting unused Workspaces

With a default Workspace Limit (spec 0029) and working email, `ZIFFR_DELETE_UNUSED_AFTER_DAYS` (30 to 3650, also on the Installation Settings page) deletes Workspaces on that default that nobody used for that many days: no sign-in and no value by any Source. Their Owners get one warning first; 14 days later, still unused, the Workspace is deleted with its key destroyed, and members whose only Workspace it was go with their sign-in. One sign-in or one value stops it. Trials, the demo and Workspaces with a limit of their own are never touched. The scheduler calls `POST /api/jobs/unused-workspaces` daily ([jobs](jobs.md)); Docker Compose does it at 04:10 UTC. Unset, nothing is deleted.

## Trials are hosted Ziffr's

A Trial Workspace is something hosted Ziffr (ziffr.net) offers, not something an Installation switches on ([spec 0040](../specs/0040-team-trials.md), [ADR 0015](../adr/0015-trials-only-on-hosted-ziffr-and-open-to-a-team.md)). Without `ZIFFR_CLOUD_KEY` there are no trials: no trial settings, no Trials section on the Installation settings page, no trial on the sign-in page, and every Workspace made here is an ordinary one that you can invite people to. A Ziffr that still has `ZIFFR_TRIAL_DAYS` set, on the server or in the Trials section an older version had on the Installation settings page, makes no Workspace at all until you remove it or set a Cloud key, so strangers never get ordinary Workspaces by mistake; the other `ZIFFR_TRIAL_*` variables only matter for trials that already exist. To let strangers look around, offer the shared demo (`ZIFFR_DEMO`, `ZIFFR_DEMO_ONLY`).

**Trial Limits** are the numbers that bound every trial on hosted Ziffr. Ziffr Cloud sets them through its signed API (`PUT /api/cloud/v1/trial-limits`, see the [Cloud API](../reference/cloud-api.md)), an Installation Admin sets them on the Installation settings page (the days a trial lasts and its data stays are Ziffr Cloud's alone, set by this call or the server's environment), and the server's environment wins over both. A limit set in the environment reaches the database's checks within the hour, with the next run of the trial job. A value outside its range is ignored and the default applies. A change applies to running trials at once, except the days, which apply to trials made afterwards. Lowering a limit never deletes or stops what a trial has: only what is new waits. The database enforces the Metrics, keys, Feeds, assistants and View Links, so no request can pass them.

| Setting | Trial Limit | Range | Default |
| --- | --- | --- | --- |
| `ZIFFR_TRIAL_DAYS` | Days a trial lasts | 1 to 30 | 14 (0 switches trials off) |
| `ZIFFR_TRIAL_GRACE_DAYS` | Days a trial's data stays after it ends | 1 to 60 | 7 |
| `ZIFFR_TRIAL_MAX` | Trials at once | 1 to 100,000 | 500 |
| `ZIFFR_TRIAL_LIMIT_PEOPLE` | People in a trial | 1 to 25 | 5 |
| `ZIFFR_TRIAL_LIMIT_INVITATIONS_PER_DAY` | Invitation emails a trial sends a day | 0 to 50 | 10 |
| `ZIFFR_TRIAL_LIMIT_INVITATIONS_ALL_PER_DAY` | Invitation emails all trials send a day | 0 to 5,000 | 500 |
| `ZIFFR_TRIAL_LIMIT_METRICS` | Metrics | 5 to 100 | 25 |
| `ZIFFR_TRIAL_LIMIT_MESSAGES_PER_DAY` | Messages a trial sends a day | 10 to 500 | 100 |
| `ZIFFR_TRIAL_LIMIT_KEYS` | Access Keys that work | 1 to 10 | 2 |
| `ZIFFR_TRIAL_LIMIT_FEEDS` | Feeds, and Feed Keys per Feed | 1 to 10 | 2 |
| `ZIFFR_TRIAL_LIMIT_ASSISTANTS` | Connected assistants | 1 to 5 | 1 |
| `ZIFFR_TRIAL_LIMIT_WEBHOOKS` | Webhooks | 0 to 10 | 2 |
| `ZIFFR_TRIAL_LIMIT_WEBHOOK_SENDS_PER_DAY` | Webhook sends a trial makes a day | 10 to 1,000 | 200 |
| `ZIFFR_TRIAL_LIMIT_VIEW_LINKS` | View Links that work | 0 to 20 | 5 |

## Running a public demo that visitors may change

A demo-only Ziffr (`ZIFFR_DEMO_ONLY=1`) can let visitors try the everyday work, not only look: enter values, make dashboards and decks, take Snapshots, define Metrics, ask Questions, share among the demo's made-up people. It is one shared demo: what a visitor changes, every other visitor sees, and it is gone when the demo starts fresh, every 15 minutes after a change ([spec 0051](../specs/0051-interactive-demo.md), [ADR 0016](../adr/0016-the-demo-opens-to-visitors-on-a-demo-only-installation.md); what visitors see: [Getting started](../user-guide/07-getting-started.md#when-the-demo-lets-you-change-things)). It is off unless you switch it on, and anything but a demo-only Installation ignores the switch. Nothing is ever sent from it: no email, Slack or Telegram message, no Webhook, no upload, no link to anything outside the demo.

### What you need first

- **An Installation that is a demo and nothing else**, with `ZIFFR_DEMO_ONLY=1`: nobody signs in or makes an account there. Never run it next to real Workspaces or on a database that holds real numbers; anonymous visitors write into that database. The demo beside real Workspaces on your company's Ziffr stays read-only whatever you set. This is enforced: the core will not open the demo to visitors, and the database refuses their writes, while a Workspace other than the demo exists, and a demo-only Ziffr takes no new Workspace ("This Ziffr is a demo and takes no new Workspaces.").
- **The job secret** (`ZIFFR_JOB_SECRET`, at least 32 characters), because the reset is a job a clock calls ([Scheduled jobs](jobs.md#the-demos-reset)).
- **A client address Ziffr can trust**, so that limits can count by address (below), and **a secret to count them under**.
- **Room for a reset.** A reset seeds the made-up company again, at most 96 times a day and only after a change. Measure what one costs on your hardware before you open it (below).

### The settings

| Setting | Value | What it does |
| --- | --- | --- |
| `ZIFFR_DEMO_ONLY` | `1` | Makes this Ziffr a public demo and nothing else. A server setting, not on the Installation settings page |
| `ZIFFR_DEMO_CHANGES` | `1` | Lets visitors change the demo. Off by default. In effect only together with `ZIFFR_DEMO_ONLY=1`. Also on the Installation settings page (Demo section) as **Visitors may change the demo**, but give it to the clock as well (below) |
| `ZIFFR_DEMO_ADDRESS_KEY` | at least 32 characters | The secret under which a visitor's network address and network are counted as keyed hashes (HMAC-SHA256), never stored as they are. Without it every change is refused and the log says so |
| `ZIFFR_PROXY_HOPS` | how many proxies add to `X-Forwarded-For` | Where the client address is read from. Behind Caddy alone it is `1` (the Docker default); behind another proxy as well, `2`. Without an address every change is refused and the log says so |

Make the key once and keep it with your other secrets. Changing it only starts every address's count again; sharing it does nothing good.

```sh skip="makes a secret for your settings file"
openssl rand -hex 32
```

**Behind Nginx Proxy Manager, Traefik or another proxy** in front of Caddy, set `ZIFFR_PROXY_HOPS=2` and tell Caddy to trust that proxy (`trusted_proxies`), or Caddy replaces the client address with your proxy's and every visitor looks like one address. The steps are in the [Docker guide](../../docker/README.md#behind-a-reverse-proxy-you-already-run). Do not trust a wider range than your proxy: whoever it covers can claim any address and so dodge the limits.

### The clock

The reset is `POST /api/jobs/demo-reset`. Where visitors may change the demo, call it every 15 minutes, at 10, 25, 40 and 55 past the hour (away from the hourly Workflows and from a release follower that updates at 2, 17, 32 and 47 past). It resets only a demo that was changed since its last reset or that is no longer young (a day old, or from an earlier UTC date), so a quiet demo costs nothing. With your own scheduler:

```sh skip="a crontab line with the job secret, which the test app does not set"
10,25,40,55 * * * *  curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://demo.example.com/api/jobs/demo-reset
```

With Docker Compose the clock does this on its own when both settings are in the settings file next to `compose.yml`: the init step copies `ZIFFR_DEMO_ONLY` and `ZIFFR_DEMO_CHANGES` into the clock's own file, which is all the clock reads. With only one of them, the clock calls the job once a night at 03:30 UTC, and what visitors changed stays until then. A demo whose seed did not finish (a step failed, so every visit is refused) is reset again at the next call, whatever the schedule's cheap checks say, and the server log says so each time. `docker compose logs clock` shows each call (`demo-reset: 200 {"reset":false}` for a demo nobody changed).

### Measure before you open it

Both scripts need a **copy** of the demo, never the live one: one resets it twice and the other hammers it.

1. Make a copy: a dump of the demo's database restored into a second database, with the app started against it (on another port, with its own `ZIFFR_JOB_SECRET`). The copy of a demo-only Installation is itself a demo.
2. **What a reset costs:** `scripts/demo-reset-measure.mjs` prints the time, the rows touched and the WAL written by `demo_reset` alone and by the whole job (the difference is the core's part: Snapshots, pins, the close, the Outbox). It needs `psql`, the app running against that database and the job secret, and `ZIFFR_DEMO_CHANGES` off (or the demo marked changed), since the job skips a clean, young demo where it is on. Watch the box's CPU while it runs. If a reset takes more than a few seconds, or writes more than you want 96 times a day, do not open the demo yet.

   ```sh skip="needs a copy of the demo's database and a running app"
   DATABASE_URL=postgresql://user:password@127.0.0.1:5432/postgres_copy \
   ZIFFR_APP_URL=http://localhost:3000 ZIFFR_JOB_SECRET=... node scripts/demo-reset-measure.mjs
   ```

3. **Whether the limits hold:** `scripts/demo-load.mjs` writes from many made-up visits at once while the reset runs, and reports where the first refusal came, how long a plain page took before, during and after, and whether the reset finished. It exits 1 if no refusal comes within 1.5 times an address's budget, if a page slows to more than three times its idle time, or if the reset job does not answer 200. It needs a copy with `ZIFFR_DEMO_ONLY=1`, `ZIFFR_DEMO_CHANGES=1`, the address key and the proxy hops set, and a POST path a visitor's change goes through (`ZIFFR_DEMO_WRITE_PATH`). Use an https address (plain http only for localhost). The job secret is sent only with `--reset` and `--yes-this-is-the-demo`, only to the address you give it, and a redirect is never followed.

   ```sh skip="needs a copy of the demo with visitors' changes on"
   ZIFFR_DEMO_URL=https://demo-copy.example.com ZIFFR_DEMO_WRITE_PATH=/some/write \
   ZIFFR_JOB_SECRET=... node scripts/demo-load.mjs --visits 20 --per-visit 40 --reset --yes-this-is-the-demo
   ```

### Switching it on

1. **Upgrade first and reset once with the setting off.** The demo's own examples (the showcase) are marked by a reset, and the database refuses every visitor's change until one ran since the upgrade. With `ZIFFR_DEMO_CHANGES` still off, every call of the job resets, so call it once and wait for it to answer `{"reset":true}`.

   ```sh skip="calls a server with the job secret"
   curl -fsS -X POST -H "Authorization: Bearer $ZIFFR_JOB_SECRET" https://demo.example.com/api/jobs/demo-reset
   ```

2. Set `ZIFFR_DEMO_ONLY=1`, `ZIFFR_DEMO_CHANGES=1`, `ZIFFR_DEMO_ADDRESS_KEY` and `ZIFFR_PROXY_HOPS` (the Docker clock gets the two demo settings from the init step). Restart so every service has them (`docker compose up -d`).
3. Call the job once more, the same way. Its first act is to tell the database that visitors may change the demo, and the database refuses a visitor until it has heard that. It answers `{"reset":false}` now, since the demo is clean and young; that is right. Without this call the door opens at the next quarter hour.
4. Open the demo in a private window. The line above the page should end with "Resets in" and a number of minutes. Change a value, check that a second private window sees it, and that after the next 10, 25, 40 or 55 past the demo starts fresh.
5. Watch the log for the first hour (next section).

### What to watch

What a visitor is told is always a plain sentence; the operator's reasons are in the server's log, once per 15-minute window, never one line per request, and never naming an address or a visit:

| Log line (the app's log) | What it means and what to do |
| --- | --- |
| `demo: no trusted client address: check ZIFFR_PROXY_HOPS; visitors' changes are refused` | The address header has too few entries for `ZIFFR_PROXY_HOPS`. Visitors see "The demo is busy". Check the number of hops, and that Caddy trusts your proxy |
| `demo: no usable address key: set ZIFFR_DEMO_ADDRESS_KEY (at least 32 characters); visitors' changes are refused` | The key is missing or too short |
| `Demo: no showcase; visits stay refused until the next reset` | The step that protects the demo's own examples failed. The demo is closed to changes, never open; the next reset tries again. If it comes back every time, read the lines before it |
| `demo-reset: 404` (the clock's log) | The demo is not offered here (`ZIFFR_DEMO=0`), or the job secret is wrong |
| `demo-reset: 200 {"reset":false}` for hours while visitors say they change things | The job does not see the setting: check `ZIFFR_DEMO_CHANGES` where the app runs |

Also watch the box: the CPU and the database's size and WAL around the quarter hours, and how many times a day the demo really resets.

### Switching it off, and going back

Set `ZIFFR_DEMO_CHANGES` to `0` (or remove it) and restart the app. From the next request the app no longer lets a visitor change anything: the demo says "The demo can't be changed." again, as before. The database closes its own door when the reset job next runs, which is the first thing the job does; the clock still on the 15-minute schedule does it within 15 minutes, and a call by hand does it at once (with the setting off every call also seeds the demo again, so what visitors made is gone). Remove the clock's `ZIFFR_DEMO_CHANGES` as well, so it goes back to the nightly call. Nothing else needs undoing: no table, no data and no migration is specific to switching it on.

### Before you open it: a checklist

- [ ] This Installation is a demo and nothing else (`ZIFFR_DEMO_ONLY=1`), and no real Workspace or real number is in its database
- [ ] `ZIFFR_DEMO_ADDRESS_KEY` is set (32 characters or more) and kept with your other secrets
- [ ] `ZIFFR_PROXY_HOPS` matches the proxies in front of it and, behind another proxy, Caddy trusts it: two private windows on different networks do not share one address's limits
- [ ] `ZIFFR_JOB_SECRET` is set, and the clock (or your cron line) calls `demo-reset` at 10, 25, 40 and 55 past; with Docker, the clock has both demo settings
- [ ] `scripts/demo-reset-measure.mjs` ran on a copy, and one reset is small enough 96 times a day
- [ ] `scripts/demo-load.mjs` ran against a copy with visitors' changes on, and ended with "OK: the limits held."
- [ ] One reset by hand with the setting off answered `{"reset":true}`, and after switching on the line on the demo's pages ends with "Resets in"
- [ ] A change in one window shows in another and is gone after the next quarter hour
- [ ] Email, Slack and Telegram are not set up here, and nothing arrives anywhere when a visitor answers a Prompt or shares something
- [ ] You know where the log lines above show, and who looks at them in the first hour
- [ ] You know how to switch it off (above), and tried it once on the copy
- [ ] You have read the [threat model](../security/threat-model.md#the-shared-demo-that-visitors-may-change-spec-0051-adr-0016): there is no check against bots here, the limits are the protection, and a group of networks can use up the demo's changes for a window

## Announcing maintenance

An **Announcement** is one plain line above every screen of the app. An Installation Admin writes it under **Installation settings, Announcements** ([the page](../user-guide/18-installation-settings.md#announcements)); nothing outside your own Installation is involved. Use it for a maintenance window, a new release or a fix people have waited for.

- **Fields.** The words (plain text, 1 to 280 characters, never markup; control and direction-changing characters are removed), an optional link (an `https://` address of at most 500 characters with no name or password in it, plus a label of at most 40 characters; `http:`, `javascript:` and `data:` are refused), a level (**info** or **warning**), an optional start and end, who sees it (everyone, or the demo only), **Also show it on the sign-in page**, **Cannot be dismissed** and **Switched on**.
- **The window.** Without a start an Announcement shows at once; without an end it stays until you switch it off. With both it can be written a day ahead and goes by itself, and the end shows within about a minute. Times are typed and shown in the time zone of your browser, which the panel names beside the field: check it when you announce a window in UTC.
- **Level.** Use a warning for maintenance: it is shown before an info and begins with the word "Warning:", so it is never told by colour alone.
- **Cannot be dismissed.** Tick it while a window is running, so nobody dismisses the notice and then wonders why saving fails. Otherwise a person dismisses an Announcement for their visit only: it comes back with the next sign-in, and when its words change.
- **The sign-in page.** Tick **Also show it on the sign-in page** (offered for an Announcement for everyone) so that people who cannot sign in read that it is down on purpose. The page shows only the words, the link and the level of public Announcements that are on and inside their window, and has no Dismiss button.
- **The demo.** The demo's own reset notice is built in: it shows whenever the demo is on, and cannot be edited or deleted. An Announcement for the demo only shows to visitors of the demo, after it.
- **Limits.** At most 20 Announcements switched on at once (a refusal says so). Three show at once, the rest behind "+N more announcements", a warning before an info and then the earlier start.
- **What is recorded.** Adding, changing, switching on or off and deleting are in the Installation's log (**Changes**), with who did it and the words at the time. Only Installation Admins can change an Announcement, and a link is never opened by itself, so keep the Installation Admins few. See [the threat model](../security/threat-model.md).

Worked examples, each one **Add an Announcement**:

1. **Maintenance on Saturday, 02:00 to 03:00 UTC.** Words: "Ziffr is down for maintenance on Saturday from 02:00 to 03:00 UTC." Level warning, shown to everyone, **Also show it on the sign-in page** on. **Starts** a day ahead, on Friday at 02:00 UTC, and **Ends** on Saturday at 03:00 UTC; if your browser is not on UTC, type the times of your zone that match. People can plan, and it ends by itself. While the work runs it should not be dismissed: either tick **Cannot be dismissed** (then the day-ahead notice cannot be dismissed either), or write a second Announcement that starts on Saturday at 02:00 UTC with that box ticked and leave the first one dismissible.
2. **New release 0.17.** Words: "Ziffr 0.17 is installed." Link `https://github.com/ziffr/ziffr/releases` with the words "Release notes". Level info, **Ends** a week later, dismissible, not public.
3. **A known bug is fixed.** Words: "Saving a value from the phone works again. If it failed for you, enter it once more." Level info, no link, **Ends** after a few days, dismissible. Switch it off early once people have read it, and **Delete** it when you no longer want it in the list.

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

## Changing keys

Two keys can change without taking Ziffr down. Neither is on a schedule you must keep, but the first is cheap enough to do once a year, and both are for after an incident.

**The Installation's key, `ZIFFR_SECRETS_KEY`**, once a year and after an incident (spec 0028, spec 0009):

1. Keep the old key somewhere safe. Make a new one: `openssl rand -base64 32`.
2. Set `ZIFFR_SECRETS_KEY_PREVIOUS` to the old key and `ZIFFR_SECRETS_KEY` to the new one, and restart. With Docker, put both in the settings file: a value there wins over the key kept in the `ziffr_keys` volume, which still holds the old one, so do not rely on the volume any more and back the new key up apart from the database.
3. The job ([scheduled jobs](jobs.md)) wraps every Workspace Key again under the new key, one row per Workspace, within a few runs. Watch the Installation settings page, under Encryption of Workspaces: it says when no Workspace Key is wrapped under the previous key any more. The job's answer counts the keys it could not open (`rewrapFailed`).
4. Then remove `ZIFFR_SECRETS_KEY_PREVIOUS` and restart. Slack bot tokens and the Installation's own sealed settings are sealed again as they are used ([Slack](slack.md)); check them before the old key goes.

Start with the new key alone, without the old one in `ZIFFR_SECRETS_KEY_PREVIOUS`, and no Workspace can be opened: put the old key back as previous at once, nothing is lost as long as you still have it.

**A Workspace's key**, when an Owner asks or after an incident, never on a schedule. On the Installation settings page, under Encryption of Workspaces, an Installation Admin picks **Change key** on the Workspace. The new key version is added at once but takes over only after about eleven minutes, so that every running server has loaded it (servers keep a Workspace's keys for 10 minutes) before anything is sealed with it. Then it seals everything written from then on, and the job seals everything written before again under it, a few hundred rows at a time while Ziffr keeps running; a big Workspace takes a while. The old key version is destroyed by the job once nothing is sealed under it any more and 15 minutes have passed since it was retired, by which time no running server can still write under it; the page lists it as retired until then. A removed Contact whose Workspace cannot be told (from before this release) keeps old key versions alive, since their name may be sealed under any of them. A value that does not open keeps the old version alive: the page counts those. Changing a Workspace's key protects what is written after it and the live database. A dump or backup taken before the change still holds the old key in wrapped form, and `ZIFFR_SECRETS_KEY` still unwraps it: that copy stays readable until it is deleted.

## Before you invite anyone

- [ ] Migrations applied, and `supabase db push` reports nothing left to do (with Docker: `migrate` did it; `docker compose logs migrate`)
- [ ] Supabase Auth: Site URL and the `/auth/callback` redirect set, email confirmations on, your own SMTP for sign-in links (with Docker: set from `ZIFFR_DOMAIN` and `ZIFFR_SMTP_URL`)
- [ ] `ZIFFR_SITE_URL` is the `https://` address people use, and the app is only served over HTTPS
- [ ] `SUPABASE_SERVICE_ROLE_KEY` and every other secret are in a secret store, not in a file in the repository
- [ ] A sign-in link arrives, opens Ziffr and signs you in
- [ ] Email: `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM` set, with SPF and DKIM for the sender's domain; an invitation reaches a test inbox
- [ ] Scheduler: both jobs called with `ZIFFR_JOB_SECRET`; after the run hour, the Workflows page shows a run "by the clock"
- [ ] The demo: filled in with `demo_reset`, or switched off with `ZIFFR_DEMO=0`; if visitors may change it, the [checklist](#before-you-open-it-a-checklist) done
- [ ] Replies by email, if used: the inbound domain's MX records, a signed forwarder, and `ZIFFR_INBOUND_AUTHSERV_ID`
- [ ] Slack, if used: the app made from the manifest, its event and interactivity URLs verified by Slack, `ZIFFR_SECRETS_KEY` backed up
- [ ] Decks: the slide editor uses tldraw, which needs a license from tldraw for production use
- [ ] Backups on, and one restore tried (with Docker: both volumes, `ziffr_db` and `ziffr_keys`)
- [ ] The workspace's time zone and run hour set on the Team page
