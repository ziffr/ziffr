# Changelog

What changes for people who use or run Ziffr, newest version first. Each section is written by `pnpm release` from the release notes that pull requests leave in `.changeset/` (ADR 0004), and the GitHub release of a version shows exactly its section. Notes waiting for the next release are in `.changeset/`.

## 0.9.0 (2026-11-18)

### For self-hosters

- A public Ziffr can offer Trial Workspaces with `ZIFFR_TRIAL_DAYS`: anyone signs in and gets a workspace of their own in which email, Slack, Telegram, the API, AI assistants and Feeds work for real but reach only them, deleted a week after it ends. See "Offering trials" in the self-hosting guide; use an Installation of its own for it.
- With `ZIFFR_TURNSTILE_SITE_KEY` and `ZIFFR_TURNSTILE_SECRET` set, the sign-in form shows Cloudflare Turnstile and sends no link until the server has checked its answer with Cloudflare. For a public Ziffr, so bots cannot make it mail any address.
- The [Telegram guide](docs/guides/telegram.md) says how to make the bot, set `ZIFFR_TELEGRAM_BOT_TOKEN`, turn Telegram on and try it on a laptop, and what to tell people about privacy: Telegram can read bot chats, so recommend its two-step verification to everyone who connects.

### New and changed

- Correlation, Drivers, the correlation matrix and a Metric's Correlation now compare Metrics of different periods, such as weekly support tickets with monthly churn: the shorter one is combined to the longer by its Aggregation, and the result says "Compared by month (18 months)". A Metric whose Aggregation is none stays with its own period, and the result says why it is missing.
- A Metric's owner who also submits it can press **Ask me now** on its page to get this period's request for the value at once, by email, Slack or Telegram, instead of waiting for the Workflow.
- A dashboard can take a Snapshot of every half-year or every year by itself: choose **Every half-year** or **Every year** under **Snapshots ▸ Take one by itself…**. Each is taken once every Metric on the dashboard is Locked for all its periods in the half-year or year, or after the set number of days.
- Owners and Admins can set the month the workspace's year starts in, under Workspace → General. Quarters, half-years and years in Comparisons and Snapshots follow it, and a fiscal year is named by both calendar years it spans, such as "FY 2026/27" and "Q1 FY 2026/27".
- A Snapshot can now be of a half-year ("H2 2026") or a whole year ("2026") as well as of a week, a month or a quarter: choose **Half-year** or **Year** under **Take a Snapshot…**. Half-years and years follow the month your year starts in. A deck made from an annual Snapshot is titled with the year.
- A quarterly Metric compares with the quarter before, its half-year and the year before (never MoM), and a yearly one with the year before. Their forecasts look two quarters or one year ahead; a yearly Metric has one after four years, and the chart says so until then.
- Workflows work per quarter and year: a quarterly or yearly Metric is asked for the quarter or year that ended ("What's the number for NPS for Q3 2026?"), its Due Date counts working days after that quarter or year, and Unusual Values, Approvals and Locks go per quarter or year.
- A Metric can now be Quarterly or Yearly: one value per quarter or year of the workspace's fiscal year, named "Q3 2026" or "2026" in its form, chart, tables and Targets tab.
- A Widget shown by quarter or year looks the same on deck slides, in Free layouts, through View Links, in Snapshots and in the PowerPoint and PDF export. A Snapshot keeps the quarter that was running at the end of its period marked "to date", however long after you open it.
- Widgets can show a Metric by a longer period: **Show by** in a Widget's menu turns a monthly Metric into quarters, half-years or years (and a daily or weekly one into weeks or months), combined by its Aggregation the same way the Comparisons are. The quarter you are in is marked "to date" with how many of its months it holds, and targets are combined by quarter too.
- Owners and Admins can turn Telegram on for their workspace on the Connectors page, once whoever runs Ziffr has set up a Telegram bot. Self-hosters: make a bot with @BotFather and set `ZIFFR_TELEGRAM_BOT_TOKEN` (with `ZIFFR_SECRETS_KEY` and an https `ZIFFR_SITE_URL`). Connecting people, sending and answers follow in the next steps of spec 0016.
- Telegram messages have buttons: an Approver approves an Unusual Value with **Approve**, and anyone stops requests for numbers and reminders on Telegram with **Stop these on Telegram**, which tells the Metric owners. Turn them on again on the Connectors page.
- Where a workspace has Telegram on, everyone can connect their own Telegram: members in the Telegram box on the Connectors page, Contacts on their personal form. Sending /stop to the bot, or blocking it, disconnects. Developers: `pnpm telegram:poll` fetches Telegram updates for a Ziffr on a laptop (`ZIFFR_TELEGRAM_POLLING=1`).
- Answers by Telegram come back: replying to a request for a number records the value, replying to a question or task answers in its Thread, and a line "Correction: 1234" proposes a Correction. A message that replies to nothing gets a hint instead, so no number lands on the wrong Metric.
- Ziffr sends requests for numbers, questions, tasks, reminders and replies by Telegram to everyone who connected their Telegram, where the workspace turned it on: choose Telegram as where you get them on the Connectors page. Telegram is a new Source for values too; Metrics that took answers by Slack or email take them by Telegram as well.
- The Connectors page shows how to connect Claude or another AI assistant through the MCP Server, with this Ziffr's address filled in. Developers: a Trial Workspace keeps at most two Access Keys and two Feeds (two keys each) that work, none past the trial's last day.
- The Connectors page says for each Connector whether it is real, simulated or off here, and why; the Outbox marks what was not sent. The demo says on every page that its messages are simulated. Developers: a Ziffr that offers trials shows them next to the demo on its sign-in page, with what works in a trial and what it asks of you.

### Fixed

- An Approval given twice at the same moment, such as a double tap on Approve in Slack or Telegram, now counts once, so the next Approver is asked once and the period is published once.
- After "Try the demo" the top bar shows the demo's navigation at once, and after "Leave the demo" the signed-out one, without reloading the page.
- A Widget shown by quarter, half-year or year now marks a past span that lacks some of its values, such as a quarter with two of its three months. It is hatched in bars, an open dashed point in a line, and named "only 2 of 3 months", so its lower sum is not read as a drop. The PowerPoint export names it the same way and shows no change against it.
- Previews of Widget and Dashboard Templates show their sample months and weeks correctly in time zones west of UTC.
- In a deck, **+** in the Pool puts a widget in the first free space on the slide, next to what is already there, instead of on top of it.
- The user guide explains quarterly and yearly Metrics: creating one, how Workflows ask for it, its Comparisons and forecast, and how the workspace's fiscal year decides where its quarters and years start.
- Comparisons of a weekly Metric by month, quarter or half-year now count the weeks of a span by the Monday they start on, so a month that starts on a Monday no longer misses a week, and one that does not no longer expects one too many.

### For developers

- Correlation moved into the core (`@ziffr/core/correlation`), where `correlate` compares two Metrics of different periods on the longer one; Forecast and Correlation now have unit tests.
- Between releases, the pre-release "Preview" on the releases page shows what `main` holds: the waiting release notes and every commit since the last release.
- The API, `@ziffr/sdk`, the MCP server and `@ziffr/feed-kit` accept and return the periods `quarter` and `year`. `GET /api/v1/workspace` (`ziffr.workspace()`, the MCP tool `get_workspace`) and `GET /api/v1/feed` say which month the fiscal year starts in. The Metric Catalog suggests Net Promoter Score, Employee Net Promoter Score and Headcount as quarterly Metrics, and Annual revenue and Annual revenue target as yearly ones.
- The API's dashboard widgets take and return `display`, the period a widget shows its Metric by ("quarter", "half", "year", and "week" or "month" for shorter Metrics; `null` for its own). The SDK and the MCP tools `add_widget` and `update_widget` take it too.
- A Trial Workspace shows its days left on every page, reminds its Owner the day before it ends, then closes (keys stop, Slack and Telegram unlinked) and is deleted a week later with its Owner, by the new job `POST /api/jobs/trial-cleanup`; its Owner can download its values as CSV or end it at once. Self-hosters: Docker Compose calls the job hourly when `ZIFFR_TRIAL_DAYS` is set, and then also resets the shared demo nightly.
- A new Trial Workspace starts with thirteen made-up Metrics (every period from day to year, every aggregation, a Breakdown, a Target Series, a Derived Metric), their history up to the last finished period, a Workflow that asks its Owner and a dashboard that shows each of them by a longer period, to date.
- With `ZIFFR_TRIAL_DAYS` set, every new workspace is a Trial Workspace (spec 0021): one per person, at most `ZIFFR_TRIAL_MAX` at once, and nobody can be invited to it. Trials are not ready to offer yet; leave the setting unset until the spec is done.
- A Trial Workspace sends email, Slack and Telegram messages only to its Owner, at most 50 a day over all of them, keeps everything else in the Outbox, takes no replies once it has ended, and holds at most 25 Metrics.
- A new Trial Workspace opens on **Try it**, a card per way values and messages travel with whether it is real here, how to try it, and a tick once a value came by it, followed by what a trial never does.

This version becomes available under AGPL-3.0 on 2029-11-18.

## 0.8.0 (2026-11-16)

### For self-hosters

- `ZIFFR_DEMO_ONLY=1` turns an Installation into a public demo: the login page offers only the demo, nobody can sign in or make an account, and with Docker Compose the demo starts fresh every night. Behind a reverse proxy of your own, set `ZIFFR_SITE_URL` and `ZIFFR_PROXY_HOPS` (docker/README.md). Developers: a new job, `POST /api/jobs/demo-reset`, resets the demo.
- Ziffr now runs with Docker in two commands, `curl -fsSL https://github.com/ziffr/ziffr/releases/latest/download/compose.yml -o compose.yml` and `docker compose up -d`, or with the installer `docker/install.sh`. The stack makes its own keys, applies migrations and calls the jobs itself, and gets HTTPS from Let's Encrypt when `ZIFFR_DOMAIN` is set; on a domain the demo is off unless `ZIFFR_DEMO=1` (docker/README.md). Each release publishes the image as `ghcr.io/ziffr/ziffr`. Installations with their own Supabase project can set `SUPABASE_ANON_KEY` instead of `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which still work.

### Fixed

- Ziffr now calls itself a metric tracker for anyone, one person, a team or a business, instead of a home for teams' business numbers. The sign-in and new-workspace pages say so.
- In the demo, the top bar no longer shows "demo" next to the Ziffr name; its controls (View as, reset, tour) still mark it.
- Security updates: the image library sharp (used by Next.js) is at 0.35.5, with fixes in libvips, libheif and librsvg. Developers: the tests run on Vitest 4.

### For developers

- The repository now says it needs Node 22 (`engines` in `package.json`), and the README lists everything a local setup needs, the Supabase CLI included.

This version becomes available under AGPL-3.0 on 2029-11-16.

## 0.7.0 (2026-11-16)

### New and changed

- The API is now a Source of its own ("API and Feeds") in a Metric's Settings, apart from the web form. Every Metric that took values from the web form keeps taking them from the API, so existing Access Keys work as before.
- A dashboard's owner can have it take a Snapshot of every week, month or quarter by itself (Snapshots ▸ Take one by itself). The daily Workflow run takes it as soon as every Metric on the dashboard is Locked for the period, or a set number of days after the period ends, and tells the owner it is ready to write up. A period is taken once, and not again after its Snapshot is deleted.
- A dashboard can have an introduction, written in Edit next to its name, and a Read view: the introduction, then its widgets one below the other, to read on a phone or to explain what happened. A View Link of a dashboard with an introduction opens in Read. The demo's "October in short" is such a dashboard.
- Snapshots: fix a dashboard to a week, month or quarter with Snapshots ▸ Take a Snapshot. It keeps the layout and the values up to the end of the period, and they never change; you write its introduction and headlines afterwards. It is a draft for the dashboard's owner and Editors until you show it to everyone who may open the dashboard. Text changed after showing is kept as Versions and marked on the Snapshot. The demo's "October in short" has Snapshots for the last two months after a reset.
- Dashboard Templates: start a new dashboard from a template, such as "One metric in depth", and pick each Metric once, even when several widgets show it. Save any dashboard you may change as a template for your team with "Save as template" in its ⋯ menu. Developers: two new Access Key scopes, "Read dashboards" and "Build dashboards", let programs and the MCP server list and read dashboards, make one from a Dashboard Template, add and change widgets, and write a dashboard's introduction and Findings, as the key's creator. A key never shares, deletes or publishes, and every change it makes is in the history under its name. See `/api/v1/dashboards` and `/api/v1/templates` in the API reference.
- A Metric's owner can change its name, description, unit, format, decimals, which way is good, target range, aggregation and what a second value does under Settings, Edit details; the period too, until the Metric has values. Each change is kept in its history.
- Feeds bring values in from another system, such as a CRM or a data warehouse. An Owner or Admin creates a Feed and its Feed Key in Settings, Feeds. A Metric's owner or Editors then choose the Feed under "Who submits". A Feed belongs to the workspace, keeps working when its creator leaves, and its values for empty past periods are imported without asking for Approval.
- Ziffr opens on your Home dashboard: choose it with Make this my home on any dashboard. The dashboard's name opens a switcher of all your dashboards and those shared with you, with search, and Dashboards in the top bar lists them. Dashboards open to look at, full width; owners and Editors press Edit to add and arrange widgets from the Pool, and Done when finished.
- A dashboard's ⋯ menu has Make a deck: you get your own copy, laid out one slide per widget, with live numbers.
- A Metric can be shared as Editor: Editors change its targets, its description (name, unit, format, target range, what a second value does and the like) and how its values arrive, while deleting and sharing it stay with its owner.
- A Metric's owner can change how its values arrive (web form, email, Slack) on its Settings tab, and new Metrics take values every way to begin with, so each person can send theirs however suits them.
- Adding a template asks for its metrics and shows the widget with them before it lands. "Change visualization" is now "Change view", and shows each option drawn with the widget's own numbers before you switch.
- A Snapshot has Make a deck: a title slide with its introduction, then one slide per widget with its words, drawing the values of its period only. Its dashboard's owner can make a View Link to a shown Snapshot; a dashboard's View Link now shows live numbers or one of its Snapshots, and stops working when that Snapshot is deleted.
- The Pool now lists the built-in templates (views, analyses, Findings, free layout) next to the team's. Pointing at a template or saved widget shows a Preview before you place it, and every row, metrics included, has an ⓘ button for one. Templates are drawn with sample data; "Browse…" shows them all side by side.
- A user guide explains Ziffr in plain words: what it is and how it differs from business intelligence tools and data warehouses, its ideas, how it is built and connected, templates, everything you work with, getting started, and every word Ziffr uses, with links from each term to its meaning. Eight more chapters go through every screen and its options. Open it with the question mark in the top bar, or at /guide, also before signing in. Self-hosters: the guide's chapters are Markdown files in `docs/user-guide`, read when a page is opened, so editing them changes no code. Set `ZIFFR_USER_GUIDE_URL` to send the link to a guide you keep elsewhere. Developers: each screen chapter names the files of its screens. `pnpm test` fails when a page has no chapter, and a pull request that changes a screen must change its chapter (label `no-guide-change` when people see no difference).

### Fixed

- An arrow drawn onto a widget on a slide or in a free layout stays attached when the widget moves. If the link preview or embedded page an arrow pointed at is removed, the arrow now stays where it was last drawn instead of pointing at nothing.
- When you start a dashboard from a template, each Dashboard Template now shows as a small preview of the whole dashboard, drawn with sample data.
- Pages and actions answer faster when signed in: Ziffr checks the session with Supabase once per click instead of three times. Developers: `pnpm prototype:fast` runs the production app locally, much faster to click through than `pnpm prototype`.
- The editorial widget with a headline, its charts and a source is now called a Finding.
- A Snapshot says which of its values were corrected or removed since it was taken, and what they are now, while it keeps the values it had. Only for Metrics you see.

### For developers

- `DELETE /api/v1/metrics/{slug}?confirm=<name>` (scope `metrics:write`), the SDK's `metrics.delete` and the MCP tool `delete_metric` delete a Metric the key's creator owns, with the same refusals as the app; the Audit Log names the key.
- A Feed Key reads `GET /api/v1/feed` and records up to 500 values per call with `POST /api/v1/feed/observations`, with one result per item. The SDK has `feed.get`, `feed.metrics` and `feed.submit`. The new MIT packages `@ziffr/feed-kit` (`defineFeed` and `ziffr-feed run`) and `@ziffr/feed-sql` (one Postgres query per Metric) write and run Feeds. See docs/guides/feeds.md.

This version becomes available under AGPL-3.0 on 2029-11-16.

## 0.6.0 (2026-11-14)

### For self-hosters

- `ZIFFR_SECRETS_KEY` can be changed without connecting Slack again: put the old key in `ZIFFR_SECRETS_KEY_PREVIOUS` until every token was sealed again (see `docs/guides/slack.md`).
- Ziffr now limits sign-in links itself, whatever Supabase's settings say: an hour allows 5 per address from one network address, 30 per address and 20 per network address. Set `ZIFFR_PROXY_HOPS` (usually `1`) to the number of proxies in front of Ziffr so it can tell network addresses apart.

### New and changed

- Slides and free layouts keep only images you paste or drop in: links, link previews, embedded pages and images from other sites are no longer placed, and ones saved before are left out when the deck or layout is shown, so showing it tells no other site that someone looked.
- A Metric's owner can now delete it from its page by typing its name. Ziffr refuses while another Metric's formula, a widget, a deck or a working View Link uses it, and the Audit Log keeps who deleted it.

### Fixed

- The Audit Log can be exported at most 10 times an hour per workspace.
- Someone signed in who opens a link to the demo now sees a page asking whether to open it, so no link from another site can drop them into the shared demo.
- Dashboards in the starter theme Coral show their figures in the text font with aligned digits instead of a code-like monospace font; a figures font someone picked stays. End dates of Access Keys, invitations and view links read like every other date, e.g. "4 Nov 2026".

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.5.1 (2026-11-14)

### Fixed

- Dashboards, decks, Analyze and presenting load faster: a page now sends only the numbers of what it shows, and a Metric you place or pick is fetched when you need it (hovering it in the Pool starts that early).

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.5.0 (2026-11-14)

### For self-hosters

- The daily Workflow run and reminders sent in bulk now queue their emails, and the deliveries job (`POST /api/jobs/deliveries`) sends them within minutes, so a slow mail server no longer holds the run up. Keep that job scheduled every few minutes.

### New and changed

- Owners and Admins can see who did what, and when, at `/audit`: role changes, removals, invitations, Shares, Groups, View Links, Access Keys, Locks, Approvals, Corrections, settings, exports and sign-ins. They can filter it and download it as CSV. Events are kept for two years and cannot be changed or removed.
- The Metric Catalog now holds 132 common business Metrics, from finance and sales to support and e-commerce, each with a definition of what it counts. On the New metric page you can search it and filter it by category.
- With an industry in the Workspace Profile, the Metric Catalog offers a filter for the Metrics written for that industry.
- The deck editor has Group and Ungroup buttons: select two or more shapes on a slide to keep them together, then move or resize them as one.
- A Metric's page has a Duplicate button: it opens the new-metric form filled in with the same description, Workflow and Submitters, for you to review before saving. Values, Shares, Target Series and history stay with the original.
- A Metric's owner can remove a saved target or projection from the targets table.
- The top bar now shows Dashboards, Metrics, Analyze and Decks, with Actions as an inbox showing how many wait for you. Members and Groups, Connectors, Workflows, Sources, Access Keys, Activity and the workspace's settings are in the Workspace menu; your profile, your Deliveries, switching workspaces and signing out are under your name. On a phone, one menu button opens all of it.
- Owners and Admins can connect the workspace's Slack with "Add to Slack" on the Connectors page, and disconnect it again. Self-hosters: this needs a Slack app and four new settings, `ZIFFR_SLACK_CLIENT_ID`, `ZIFFR_SLACK_CLIENT_SECRET`, `ZIFFR_SLACK_SIGNING_SECRET` and `ZIFFR_SECRETS_KEY` (see `.env.example`).
- Answering a Slack message in its thread records the number, replies in the Thread or proposes a Correction, and the buttons approve a value or stop Prompts and reminders on Slack. Self-hosters: `docs/guides/slack.md` has the Slack app's manifest and the setup steps.
- Once a workspace connects Slack, Prompts, reminders, questions, tasks and replies chosen for Slack arrive as real direct messages from the Ziffr app, and the Outbox shows whether each was sent, is waiting or failed. Self-hosters: the deliveries job now also retries Slack messages.
- Colour now means one thing: green or red says whether a value is on target, shown as a small "Below target" or "On target" chip next to a neutral number, while arrows and signs show which way it changed. Dashboards and metric pages have one main Share button (with "Who can see this" and view links inside it), and Theme, Versions and the rest sit in a ⋯ menu.
- A metric's page is split into Overview, Analysis, Targets, History and Settings tabs instead of one long scroll, and says which target applies to the latest period. Targets and projections are now an editable table: add a row, change a value, or paste two columns from a spreadsheet and check the preview before saving.
- Ziffr reads like a finished product: no more "prototype" labels or developer hints, deleting or locking asks in a proper dialog that says what happens, dates read "4 Nov 2026" everywhere, and values use the body font with aligned digits. A new workspace gets a short checklist on the Dashboards page, and demo-only buttons (playing a recipient, running the schedule by hand, previews of analyses still to come) now show only in the demo; owners and admins elsewhere find "Run now" on the Connectors page.
- Owners and Admins find the workspace's name, its time and its new Workspace Profile (industry, customers, country, currency, size and revenue) under Settings, Workspace, and Access Keys under Settings, Access Keys; both left the Team page. The settings side nav links Members and Groups, Connectors, Workflows, Sources, Activity and the Audit log.
- You can change your own name and colour under Settings, Your profile, which also shows the address you signed in with. Your Deliveries gathers where Ziffr reaches you, whether Prompts and reminders come by email (now also stopped from Ziffr itself, not only from an email) and your Away dates.

### Fixed

- Only Owners and Admins can start the scheduled requests and reminders by hand ("Run now" on Connectors); in the demo everyone still can.
- The Sources page shows each person only the Prompts and incoming messages that are their own, and no one else's Token code; the demo still shows all of them.
- Charts, the Metrics list and the API no longer leave out the newest values once a workspace has many of them, and Breakdowns no longer go missing on Metrics with a long history. Self-hosters: keep Max Rows in your Supabase project's API settings at 1000 or more.
- Pages that decide who sees what load faster in workspaces with many people, Groups and shares, and the Sources page shows the latest 300 Prompts and the latest 300 incoming messages.

### For developers

- `pnpm ci:local` runs everything CI checks on your machine, against the local Supabase; CI on GitHub runs less often and cancels runs a newer push replaces.

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.4.0 (2026-11-14)

### For self-hosters

- `docs/guides/self-hosting.md` takes Ziffr from an empty Supabase project to a team using it (migrations, sign-in settings, the app's settings, build and run, the scheduler, upgrading, backups) and ends with a checklist for production. The README now describes Ziffr as it is.

### New and changed

- The Workflows page shows when Workflows run in your workspace, how the last run went, and lets Owners and Admins run today's steps now, once. Pretending it is another day is left to the demo, and closing a period counts from your workspace's today.
- Workflows run on their own: a job your scheduler calls every hour runs each workspace's Workflows once a day at its run hour, in its own time zone, asking for missing values, reminding and escalating on the days the Workflow says, and reminding people of tasks due within two days. Self-hosters: run the new migration and call `POST /api/jobs/workflows` hourly with `ZIFFR_JOB_SECRET` (see `docs/guides/jobs.md`).
- Owners and Admins set the workspace's time zone and the hour its Workflows run each morning, on the Team page (UTC and 08:00 until they do). It decides which day "today" is for the team, ready for Workflows that run on their own. Self-hosters: run the new migration.

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.3.0 (2026-11-14)

### New and changed

- Invitations by email are now emailed, with the link to join, once email is set up. The Team page shows whether each went out, and why not if it failed, and you can resend one (at most three times). The link is still shown, for sending it some other way. Self-hosters: run the new migration.
- Every request for a number and every reminder by email has a one-click link to stop them (also in the mail client's unsubscribe button); the Metric owners are told, and the person can turn them on again on the Connectors page. A workspace sends at most 500 emails a day, one inbox gets at most 20 an hour and one person causes at most 300 a day, from all workspaces together; the rest wait. The Outbox no longer shows the sender of a request other people's form links. The Connectors page says when email is real. Self-hosters: run the new migration, and see `docs/guides/email.md` for setting up sending and replies.
- Replies by email come back into Ziffr: answering a Prompt with the number records it (a Breakdown too, one row per line), and answering a question or task puts the reply in its Thread, where a "Correction: 1234" line proposes a Correction. Quoted text and signatures are left out, and the person is told what became of their number. Only the person the email went to can answer it. Self-hosters: run the new migration, set `ZIFFR_INBOUND_DOMAIN`, `ZIFFR_INBOUND_SECRET` and, so senders are checked, `ZIFFR_INBOUND_AUTHSERV_ID` (without it, Approvals are not taken by email), and have your mail provider forward replies to `POST /api/inbound/email`, signed (the self-hosting guide follows).
- Ziffr can send real email: Prompts, reminders, questions, tasks and replies by the Email Connector now go out through your SMTP server, with links back into Ziffr. The Outbox shows whether each was emailed, is waiting or failed. Self-hosters: run the new migration, set `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM` (and `ZIFFR_SITE_URL`, for the links) to turn sending on (without them nothing is sent, as before), and have a scheduler call `POST /api/jobs/deliveries` with `ZIFFR_JOB_SECRET` to retry failed sends. The demo never sends.

### Fixed

- Replies by email check the mail provider's verdict on the sender more strictly: text the sender wrote inside the provider's Authentication-Results header can no longer pass as a verdict.
- The retry job for email now picks the emails that are due in the database, so emails waiting out a limit can never keep others from going out. Self-hosters: run the new migration.
- Invitation emails are limited: a workspace sends at most 50 a day, a person at most 50 a day from all their workspaces, and one inbox gets at most three a day from all workspaces together. Over that, the Team page asks you to send the link yourself. The subject no longer carries the workspace's name. Self-hosters: run the new migration.

This version becomes available under AGPL-3.0 on 2029-11-14.

## 0.2.0 (2026-11-14)

### For self-hosters

- The demo is on by default and lives in its own workspace beside your real ones; set ZIFFR_DEMO=0 to offer none. `pnpm demo` is now the same as `pnpm dev`.
- Email confirmations are now required (supabase/config.toml, enable_confirmations = true); set the same in production, so a confirmed address is one the person controls. Only the email link and Google count as proving an address for invitations, domain joining and existing people.
- Every table now belongs to a Workspace and people get a Workspace Role through memberships; existing data moves into one workspace. Set `ZIFFR_SITE_URL` to where Ziffr is reached, and to offer sign-in providers list them in `ZIFFR_AUTH_PROVIDERS` (google, azure, github, linkedin_oidc) with their keys in `SUPABASE_AUTH_EXTERNAL_<PROVIDER>_CLIENT_ID` and `_SECRET`.

### New and changed

- Access Keys: on the Team page, create a key that lets a program read metrics or submit values for you in this workspace until a day you pick, and revoke it any time; Owners see and revoke every key. A key sees no more than you do, and stops when you leave the workspace. Self-hosters: run the new migration.
- The API now limits each Access Key to about 60 calls a minute; a program that goes over gets a 429 answer with `Retry-After` and gets in again after waiting. Every call with a key goes into its Access Log (when, which endpoint, the result; never the data sent), shown under the key on the Team page and kept for 90 days. Owners and Admins see every key and its log, everyone else their own; only Owners and a key's creator can revoke it. Self-hosters: run the new migration.
- Workspace admins can now change themes, groups and team settings, like owners.
- Programs can create metrics: `POST /api/v1/metrics` with a key that may create metrics. The metric belongs to the key's creator, who can be made its Submitter in the same call, and an `Idempotency-Key` keeps a retry from making two. See the API guide.
- Programs can list the Metrics they may read through the new API: `GET /api/v1/metrics` with an Access Key in the `Authorization` header. Errors share one JSON shape, lists page with a cursor, and a Metric the key's creator may not see is not found. See `docs/guides/api.md`.
- The API describes itself: `GET /api/v1/openapi.json` serves an OpenAPI 3.1 document, so you can generate a client in any language, and `docs/reference/api.md` lists every endpoint with its parameters, answers and errors. Both are generated from the server's own validation, so they always match what the server does.
- Programs can now read more through the API: a Metric's description (`GET /api/v1/metrics/{slug}`), its values for a range of periods with Breakdowns and whether each is recorded, waiting for Approval or locked (`/observations?from=&to=`), and the names of the workspace's people and Groups (`/people`, `/groups`). People come with id and name only, never an email or phone. A Metric the key's creator may not see answers 404, like one that doesn't exist.
- Programs can submit values: `POST /api/v1/metrics/{slug}/observations` with a key that may submit values. The value goes through the same rules as one from a form or Slack (Submission Rule, Locks, Approvals), and the answer says whether it was recorded, waits for Approval or hit a locked period. Send an `Idempotency-Key` so a retry never records a value twice. Each key may submit 1,000 values a day. The Metric's history shows such values as from the API, with the key's name. Self-hosters: run the new migration.
- Keep Contacts: people without a login, such as a field worker or an outside bookkeeper, with their email, Slack handle or phone (Team page). Make them submitters of a Metric, and their values by Slack, email or form link are recorded under their name. Removing a Contact keeps their values and stops their links.
- Share with "Everyone in the workspace" in one click: every workspace has this group, which always holds all its members except guests. Start another workspace from the + next to your name, and switch between yours there.
- Removing a member on the Team page asks who takes over: their metrics, dashboards, decks, templates, themes and Workflows pass to that person, open tasks and approvals go along, and their Tokens, stand-in roles, shares and Access Keys end at once. Nothing is deleted, and the handover shows in each object's version history. Self-hosters: run the new migration.
- Invite people by email or with a link, each with a role; an invited Contact becomes a member and keeps their history. Owners and Admins change roles on the Team page (only Owners make Owners, and the last Owner stays). Owners can let people with an address at the company domain ask to join; an Owner or Admin lets each one in. Self-hosters: run the new migration.
- Access Keys can now be allowed to create metrics ("Create metrics" on the Team page). Such a metric belongs to the key's creator, is checked like one made in the form, and its history names the key; a key creates at most 50 a day, and never more than its creator's role allows.
- People now sign in with an email link (or Google, Microsoft, GitHub or LinkedIn once set up), create a workspace on first sign-in and see only their own workspaces. "View as", reset and the tour stay in Demo Mode (`pnpm demo`); `pnpm prototype` still starts the demo.
- Anyone can try Ziffr without an account: "Try the demo" on the login page opens a made-up online shop next to the real workspaces. Switching between its people and resetting it only ever touch the demo.

### Fixed

- A late value for a locked period, once accepted as a Correction, now replaces the value that was there (which is kept as the original) instead of being added next to it.
- Guests can no longer create dashboards or save widgets to the Pool. Widget positions and sizes stay in range, and very large widget settings are refused.
- A View Link shows only the widgets the dashboard had when the link was made, and only widgets whose every Metric is shown; restoring an old version checks the Metrics named inside widgets too. Guests can no longer create decks or templates.
- Messages listed on the Connectors page name the recipient instead of showing their Slack handle or phone number.
- Guests can no longer create Metrics; a new Metric only takes known formats, periods, rules and Sources.
- Guests can no longer share, grant access or make View Links, also not for things they owned before becoming a Guest.
- Live View Links open again for people without an account; they had sent visitors to the sign-in page since workspaces arrived.
- Links to personal submission forms are now random and can no longer be guessed from a person and a Metric; links sent before keep working.
- A View Link to a deck shows only the shapes the deck had when the link was made, and widgets that name a hidden Metric anywhere in their settings are refused or left out. Self-hosters: run the new migration; the image optimizer is switched off (Ziffr does not use it).
- Guests can no longer create or run Workflows, or send reminders; restoring a Workflow version saves it as the person restoring it.

### For developers

- Questions and tasks, Threads, Deliveries and Delivery Preferences, Workflows, approvals and Locks, the Connectors and the demo's simulated channels all live in the core. The web app has no permission code of its own any more: every server action calls a core function that takes the Actor first.
- Dashboards, widgets, layouts, Free Layouts, the Analysis Canvas and View Links go through the core (`@ziffr/core/dashboards`, `view-links`), and versions and the built-in widget templates live there too.
- Decks, Themes, Widget Templates and slide layouts, and the version history (list, name, restore) go through the core (`@ziffr/core/decks`, `workspace-themes`, `templates`, `version-history`). Self-hosters: run the new migration (View Links remember their widgets).
- The core's exports and modules must be documented, prose in the docs is checked by Vale, and pull requests that change the public surface must change docs or the glossary, or add a release note.
- `@ziffr/mcp`, an MIT-licensed MCP server, lets an assistant such as Claude Desktop or Claude Code read your Metrics and submit values with an Access Key: run `npx @ziffr/mcp` with `ZIFFR_URL` and `ZIFFR_ACCESS_KEY`. It offers `list_metrics`, `get_metric`, `submit_value` and `list_people`, and every visible Metric as a resource. It sees only what the key's creator sees. See `packages/mcp/README.md`.
- The app lives in `apps/web`, shared domain rules in `packages/core`; `pnpm typecheck`, `pnpm lint` and `pnpm test` run across all of them, and CI runs them on every pull request.
- Every page reads through the core (`@ziffr/core/page-data`, Actor first); the web app touches the database only to find the signed-in person and for the demo, and CI checks that it stays so.
- Every pull request that changes what people use or run adds a release note (`pnpm changeset`); `pnpm release` sets the version, writes the changelog section and tags it, and the GitHub release shows the same text.
- `@ziffr/sdk` gains `metrics.create`, and `@ziffr/mcp` a `create_metric` tool, so a script or an assistant can start tracking a new metric with a key that may create metrics. Both send an idempotency key, so a retry never makes two.
- `@ziffr/sdk`, an MIT-licensed TypeScript client for the API. It has typed calls for every endpoint, iterates over pages for you, waits out a 429 as `Retry-After` says, and sends an idempotency key with every submission so a retry never records a value twice. See `packages/sdk/README.md`.
- A threat model in docs/security; CI scans the whole history for secrets, fails on known-vulnerable production dependencies, and refuses client components that import core code reaching the database.
- Creating Metrics and uploading their series, sharing, "who can see this", access requests, Groups and Contacts go through the core (`@ziffr/core/metrics`, `sharing`, `team`), with permission tests against the database. What a person sees is loaded in `@ziffr/core/access` and `workspace-data`.
- Submitting values (intake, the web form, answers to Prompts) and deciding Corrections live in `@ziffr/core/submissions` and are tested against a real database (`pnpm --filter @ziffr/core test:db`, also in CI).
- Who sees what is decided in `@ziffr/core/visibility`, which ignores data from any other workspace; the app loads only the current workspace's data.

This version becomes available under AGPL-3.0 on 2029-11-14.
