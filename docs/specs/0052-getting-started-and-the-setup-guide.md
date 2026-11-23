# 0052 Getting started: the Setup Guide, from the first sign-in to a working loop and a team

**Status:** draft (2026-11-23). No tickets yet: the owner reads the spec and the **Decisions (accepted unless the owner objects)** first; the tickets are opened once the owner accepts it. It extends the Trial Guide of spec 0021 (ticket 193) and spec 0040, and replaces the first-run checklist "Get your workspace ready".

## Problem Statement

The owner asked on 2026-11-23 to "start to think about onboarding" (the owner's everyday word; GLOSSARY lists it under _Avoid_ for the Trial Guide, so this spec names the thing **Setup Guide** and does not use the word again). The request, in short:

1. Ziffr should know who it is talking to: industry, business function, revenue and employee brackets, geography. Ziffr collects most of it already, "but deep down somewhere in the menus".
2. Based on that, Ziffr should offer two ways on: explore the app alone and start from scratch, or start from the content of a Pack (starter Metrics, Workflows, widgets and their designs, dashboards and their templates).
3. Then ask how the company wants to connect inward and outward (the owner said "channels"; Ziffr's word is **Connector**, and "channel" is on its _Avoid_ list), and make setting those up "as easy as can be".
4. Then let the person test the first Metric in both directions, and then create the team.
5. All of it tracked in a panel, and Ziffr should be proactive when someone joins Ziffr for the first time.

What a new person meets today, checked on `main` (44fdb94d):

- **Signing up.** The magic-link sign-in (`apps/web/src/app/login/*`) leads to `/welcome` (`apps/web/src/app/welcome/page.tsx`, `form.tsx`), which asks one thing, the Workspace's name, and offers **Ask to join** (Domain Joining) and, where an import is offered, **Start from a Workspace Export**. `createWorkspace` in `apps/web/src/app/auth-actions.ts:74-91` then sends a trial to `/try/start` and everyone else to `/`.
- **An ordinary Workspace** gets a default Theme and nothing else (`createWorkspace` in `packages/core/src/page-data.ts:407-426`). Its home is an empty Dashboards page with the first-run checklist.
- **The first-run checklist** (`apps/web/src/components/first-run.tsx`, rendered only from `apps/web/src/app/dashboards/screen.tsx:174-181`, its facts built in `apps/web/src/components/dashboard-view.tsx:42-45`) has five steps: Describe a metric, Add its first value, Invite a teammate (Owners and Admins), Build a dashboard and Set the workspace time (Owners and Admins). Its ticks are worked out on each render and nothing stores them. It is the same for everyone in the Workspace, cannot be dismissed, vanishes as soon as any dashboard exists, is never shown in the demo and needs `can(actor, "create")`. **Build a dashboard** is `done: false` written into the code, so it ticks only by making the checklist disappear. **Set the workspace time** ticks when `time_zone !== "UTC"`, so a Workspace that really is in UTC can never tick it.
- **The Trial Guide** (hosted trials only): `apps/web/src/app/try/start/{page,guide,actions,other-ways}.tsx` and `packages/core/src/trial-guide.ts`, with `GUIDE_STEPS = welcome, where, connect, ask, done` and the ways email, web form, Slack and Telegram. Its state lives on the Workspace row: `trial_guide_step`, `trial_guide_ways`, `trial_guide_finished_at` and `trial_test_metric_id` (migrations `20261223090000_trial_guide.sql` and `20261223100000_trial_guide_finished.sql`). Only the trial's Owner has it (`assertGuideOwner`). `apps/web/src/app/page.tsx:11` and `apps/web/src/app/try/page.tsx:48` send that Owner back to it until it is finished or skipped, and the trial bar (`apps/web/src/components/trial-bar.tsx:21`) reopens it. The trial seed (`packages/core/src/trial-seed.ts`) makes the Test Metric "Cups of coffee", a daily Workflow and a small dashboard. It is the best first experience Ziffr has, and only trials get it.
- **The Workspace Profile** (`packages/core/src/workspace-profile.ts`; `workspaceProfile` and `setWorkspaceProfile` in `packages/core/src/workspace-settings.ts:42-62`; columns `industry` (18 keys), `segment`, `country`, `currency`, `employee_band`, `revenue_band` with CHECK constraints from `20261122120000_workspace_profile.sql`) is written by Owners and Admins only, and audited. Its form `WorkspaceProfileForm` is the **last** section of **Workspace → General** (`apps/web/src/app/settings/workspace/page.tsx:76`). It filters the Metric Catalog's suggestions (`apps/web/src/app/metrics/new/page.tsx:84-87`) and gives the Number Style and the Answer Languages a default from the country. Nothing asks for it.
- **Nothing describes a person's work.** A person's profile holds a name, a colour and how to reach them (`apps/web/src/app/settings/profile/page.tsx`). There is no business function, and no role in the company.
- **Packs.** Twelve files in `packs/` (format `ziffr.pack/1`): SaaS metrics, Online shop, Agency or freelancer, Sports club, Board meeting deck, the five function Packs Sales, Finance, People and HR, Customer support, Operations and fulfilment, and Workspace usage and Ziffr operations. Their manifest has `id`, `name`, `version`, `summary`, `author`, `license`, `ziffr`, `logo`, `listing` and `feeds` (`packages/pack/src/pack.ts:50-66`), and **nothing about whom a Pack is for**. Only single Metric entries carry `industries` and `segments` as free tags (`packages/pack/src/metric-file.ts:25`); SaaS metrics, Online shop and Agency set them. **None of the twelve can be installed from inside the app:** the Packs page installs an uploaded file or, where an Installation Admin turned it on, a Marketplace Pack (`PackOrigin` is `upload | marketplace`, `packages/core/src/packs.ts:164`), and the user guide says to download the file from Ziffr's repository (`docs/user-guide/19-packs.md:15`). Nothing suggests a Pack, nothing installs one by itself, and installing one makes no Metric: **Set up from this Pack** (`setUpFromPack` in `packages/core/src/pack-setup.ts:208`) does.
- **Ways in and out** are spread over seven pages. In: the Sources page and its simulator (`/connectors/sources`), the Slack and Telegram panels on **Connectors** (`/connectors`), Access Keys (`/settings/keys`), Feeds and Feed Keys (`/settings/feeds`, warehouse Feeds of spec 0048), **Send values** (`/connectors/send`, n8n and the ready command), paste from a spreadsheet (`/paste-values`, spec 0026) and assistants (`/settings/assistants`). Out: Who gets what (`/connectors/who-gets-what`), personal Deliveries (`/settings/deliveries`), the Outbox, Alerts, Webhooks and Personal Webhooks, Snapshots, decks and View Links. Slack needs the Installation's Slack app and then **Add to Slack**; Telegram needs the Installation's bot and then **Turn on** and **Connect**. There is no CSV upload.
- **Testing a way.** **Ask me now** (`packages/core/src/ask-now.ts`, ten minutes between asks per Metric) sends the real Prompt to the Metric's owner when they also submit it. A Personal Webhook has a real test (`sendTestPersonalWebhook`). There is no test message to oneself on Slack, Telegram or email from a Workspace: `sendTestEmail` (`packages/core/src/installation-settings.ts:454`) and the Telegram round trip (`installation-telegram-test.ts`) are Installation Admin tools.
- **The team.** `/team` (`apps/web/src/app/team/*`, `packages/core/src/invitations.ts`): invitations by email or link, Workspace Roles, Domain Joining, Contacts, Groups, Stand-ins and Away. Only the checklist's **Invite a teammate** points there.
- **A person who joins** by invitation or Domain Joining lands on `/` (`acceptInvite`, `apps/web/src/app/auth-actions.ts:108-119`): the dashboards shared with them, or "Nothing has been shared with you yet". Nobody welcomes them or asks how they want to be asked.

So a new Owner of an ordinary Workspace starts from a name and an empty page, the facts that would let Ziffr help them sit in the last section of a settings page, the twelve Packs that would give them a start are a download away, and the one guided start Ziffr has is reserved for trials.

## Solution

One guided start for every Workspace, the **Setup Guide**. It opens by itself after the first sign-in, walks through five steps, ticks each one from what the Workspace really has, and stays reachable in a line at the top of every page until the steps are done or the person hides it. The Trial Guide becomes the Setup Guide as a trial has it.

1. **It opens by itself, once.** After the sign-in link and the Workspace's name, the new Owner lands on **Set up your Workspace** (`/setup`) instead of an empty Dashboards page. Someone who joins an existing Workspace gets a short version: a welcome, their own **About you**, how they will be asked, and where the team's numbers are. A Guest gets nothing. Every screen has **Skip for now** and **Go to Ziffr**; the guide never stands between a person and the app.

2. **About you.** One screen of plain questions, each optional and each saying what it is for: the industry, who the business sells to, the country (which proposes the currency), how many people work there, the revenue, and the person's own **Business Function**. The Owner also confirms the Workspace's time zone and the month its year starts. A line under the questions says where the answers stay: in this Workspace, and nowhere else.

```
┌─ Set up your Workspace ─────────────────────────── Skip for now · Go to Ziffr ┐
│ ● About you   ○ Starting point   ○ Ways in and out   ○ First Metric   ○ Team   │
│                                                                                │
│ About you and your business                                                    │
│ So we can suggest Metrics and Packs that fit. Every question is optional.      │
│                                                                                │
│ What does your business do?        [ Software and SaaS            ▾ ]          │
│ Who do you sell to?                [ Businesses (B2B)             ▾ ]          │
│ Where is it based?                 [ Germany ▾ ]  Currency [ EUR ▾ ]           │
│ How many people work there?        ( ) 1-10 (•) 11-50 ( ) 51-200 ( ) more      │
│ Revenue in a year                  [ 1 to 10 million            ▾ ] (skip)     │
│ What do you work on yourself?      [ Finance                      ▾ ]          │
│ Your Workspace's day               Europe/Berlin, asks at 08:00 · year: Jan    │
│                                                                                │
│ What you answer stays in this Workspace. It is not sent to Ziffr's makers or   │
│ anyone else, and it is never used for anything but the suggestions here.       │
│                                                   [ Skip ]   [ Save and go on ]│
└────────────────────────────────────────────────────────────────────────────────┘
```

3. **Starting point.** Two clear choices. **Explore on my own** starts from scratch: the Metric Catalog, filtered by the answers, for the first Metric. **Start from a Pack** shows Ziffr's own Packs, ranked by how well each fits the answers, each with the reason ("Suggested because of your industry and your function"), what it brings (its Metrics by name, its Workflows, dashboards and View Designs, as counts and names) and **Preview**, the Packs page's existing preview drawn with Sample Data. The first three are shown; **See all Packs** shows every one, none hidden. Installing goes through the existing install path, for Owners and Admins, by a click. Then the guide offers **Set up from this Pack** in place, with a few of its Metrics ticked, so the first Metric exists before the next step.

```
┌─ Starting point ───────────────────────────────────────────────────────────────┐
│ How do you want to start?                                                      │
│                                                                                │
│ ┌ Explore on my own ───────────────┐  ┌ Start from a Pack ───────────────────┐ │
│ │ An empty Workspace. Describe     │  │ Ready-made Metrics, a dashboard and  │ │
│ │ your first Metric from the       │  │ a Workflow that asks for them. You   │ │
│ │ catalog or from scratch.         │  │ change everything afterwards.        │ │
│ └──────────────────────────────────┘  └──────────────────────────────────────┘ │
│                                                                                │
│ Suggested for you                                                              │
│  SaaS metrics      because of: your industry, who you sell to                  │
│   13 Metrics (MRR, Churn rate, …) · 2 Workflows · 1 dashboard · 2 decks        │
│   1 View Design · 1 Theme                         [ Preview ]  [ Install ]     │
│  Finance           because of: your function                                   │
│   8 Metrics (Revenue, Cash, …) · 1 Workflow · 1 dashboard  [ Preview ] [Install]│
│  Board meeting deck  because of: your function                                 │
│   4 Metrics · 1 deck · 1 Theme · 1 Workflow                [ Preview ] [Install]│
│ See all 12 Packs ▸                                                             │
└────────────────────────────────────────────────────────────────────────────────┘
```

4. **Ways in and out, as one conversation.** Two questions on one screen: **How should numbers come in?** and **How should people be asked and told?** The first ways offered are the ones a person uses without help: email, the web form, Slack and Telegram, and pasting from a spreadsheet as the easiest way in. Access Keys, assistants, Feeds and warehouse Feeds, n8n and **Send values** are **More ways**, as links. Each way shows its state in one line, from the same `whatWorksHere` that the sending queue obeys: ready, one click away (**Add to Slack**, **Turn on Telegram** and **Connect my Telegram**), or missing on this Ziffr, said in words ("This Ziffr has no Slack app yet. Whoever runs it adds one on the Installation settings page; here is how"). Each way that reaches a person has **Send me a test**, a **Test Message** to the person themselves.

```
┌─ Ways in and out ──────────────────────────────────────────────────────────────┐
│ How should numbers come in?                                                    │
│  ✓ Web form       Every request carries a personal link. Nothing to set up.    │
│  ✓ Email          Reply with the number.                     [ Send me a test ]│
│  ○ Slack          Not connected yet.                         [ Add to Slack ]  │
│  ! Telegram       This Ziffr has no Telegram bot. Whoever runs it adds one on  │
│                   its Installation settings page. (How?)                       │
│  ○ Paste          Paste rows from a spreadsheet.             [ Try it ]        │
│  More ways: a program (Access Key) · an assistant · a Feed · a warehouse · n8n │
│                                                                                │
│ How should people be asked and told?                                           │
│  Ask me by        [1. Email ▾] [2. —  ▾] [3. — ▾]            (saved for you)   │
│  Others are asked by what they choose; the default is the first way that       │
│  reaches them. Later: Alerts, Snapshots by email, View Links, Webhooks.        │
│                                                   [ Skip ]   [ Save and go on ]│
└────────────────────────────────────────────────────────────────────────────────┘
```

5. **First Metric: the loop, both ways.** The person picks the Metric to try with: the first one made from the Pack or from scratch, or Cups of coffee in a trial. **Ask me now** sends its real Prompt where the person chose to be asked (out). The person answers it there, or uses the form link, or pastes a value (in). The step shows what should arrive and where ("An email from Ziffr with the subject 'MRR for November 2026?'"), waits for the value, and ticks when both happened. When nothing arrives within a few minutes, it says what to check, way by way, and links the Outbox entry with its reason.

```
┌─ First Metric ─────────────────────────────────────────────────────────────────┐
│ Try MRR both ways                                       [ Another Metric ▾ ]   │
│                                                                                │
│ 1. Out: Ziffr asks you            [ Ask me now ]                               │
│    ✓ Sent by email to anna@example.org at 10:42. Look for "MRR for Nov 2026?"  │
│                                                                                │
│ 2. In: you answer                                                              │
│    Reply to the email with the number, or use the link in it,                  │
│    or [ paste it here ].           … waiting for your value                    │
│                                                                                │
│ Didn't arrive? · Check the spam folder · Quiet Hours until 07:00 hold it ·     │
│ See it in the Outbox (it says why)                                             │
└────────────────────────────────────────────────────────────────────────────────┘
```

6. **Team.** Invite by email or by a link, with each Workspace Role explained in one line; turn on Domain Joining for the company's domain; optionally make a first Group. Then **Who gets what**: for the Metrics just made, who is asked for each, with a suggestion from people's Business Function where they gave one. The step ticks when the Workspace has anyone besides its Owner, or an invitation waiting, or Domain Joining on.

```
┌─ Team ─────────────────────────────────────────────────────────────────────────┐
│ Who else should be in this Workspace?                                          │
│  [ colleague@example.org ] [ Member ▾ ] [ Invite ]   or  [ Copy an invite link]│
│   Owner: everything, billing too · Admin: everything but billing and Owners ·  │
│   Member: makes and shares Metrics, dashboards and decks ·                     │
│   Guest: sees what is shared with them, answers, sends values                  │
│  [ ] Let people with an @example.org address ask to join                       │
│  [ ] Make a Group: [ Finance team ]                                            │
│                                                                                │
│ Who is asked for what                                                          │
│  MRR             you            [ change ]                                     │
│  Cash balance    you            suggested: Ben (Finance)  [ ask Ben ]          │
│                                                   [ Skip ]   [ Done ]          │
└────────────────────────────────────────────────────────────────────────────────┘
```

7. **The Setup line and the Slide-over.** Until every step is done or skipped, a thin line at the top of each page says how far the guide is and what is next: "Setup: 2 of 5 done. Next: Ways in and out." **Continue** opens the guide's list in the Slide-over, the app shell's one panel host (spec 0050, `apps/web/src/components/slide-over-host.tsx`), with each step, its tick, the next one highlighted and **Skip** beside each. **Hide** puts the line away for this person. Help (the **?** button and the sidebar's Help entry) and the person's menu keep **Setup Guide** to reopen it. The first screen after sign-up is the full page `/setup`, because there is nothing else to look at yet; later the same steps open in the Slide-over beside the page.

```
┌ Setup: 2 of 5 done. Next: Ways in and out.         [ Continue ]  [ Hide ] ┐
└────────────────────────────────────────────────────────────────────────────┘
                                         ┌ Setup Guide ─────────────── × ┐
                                         │ ✓ About you                     │
                                         │ ✓ Starting point: SaaS metrics  │
                                         │ ▶ Ways in and out        [Skip] │
                                         │ ○ First Metric           [Skip] │
                                         │ ○ Team                   [Skip] │
                                         │                                 │
                                         │ Hide the Setup Guide            │
                                         └─────────────────────────────────┘
```

8. **Who sees which steps.** Owners and Admins see all five, and they share one Workspace's progress: what one Admin did ticks for the other. A Member sees **About you** (their own function) and **Ways in and out** for their own Delivery Preference and their own Slack or Telegram link, and the line goes once those are done. A Guest sees no line and no guide. In the demo nothing of it appears; the demo keeps its own guided steps (`apps/web/src/components/tour.tsx`).

9. **Trials and self-hosted Ziffr.** A Trial Workspace opens the same guide: its First Metric is the Test Metric, its limits are the Trial Limits, and the trial bar, the Test Metric seed and the Trial Limits stay the trial's own. A self-hosted Ziffr shows the same guide with no hosted dependency; a way the Installation lacks (no mail server, no Slack app, no Telegram bot) is said plainly, and the guide still ends, with the web form and paste.

10. **Knowing it works, without telemetry.** Nothing about the guide is sent anywhere. The owner runs a trial of the flow with five people new to Ziffr (as spec 0041's reader trial), and every Owner sees the facts of their own Workspace: "Setup: 4 of 5 steps done" on the Workspace settings page.

### Words

| Word | Meaning | Not |
| --- | --- | --- |
| **Setup Guide** (new term) | The five steps that set up a Workspace (About you, Starting point, Ways in and out, First Metric, Team), opened by itself at a person's first sign-in and reopened from Help or the Setup line. Each step ticks from what the Workspace has, and each can be skipped. Its progress is the Workspace's, shared by its Owners and Admins; hiding it is each person's own. A Member sees the steps about themselves, a Guest none, the demo never. | Wizard, onboarding, tour, checklist |
| **Business Function** (new term) | The part of a business a person works in, picked by that person from a fixed list (sales, marketing, finance, operations, customer support, people and HR, product and engineering, management, something else). Set per Workspace, optional, seen only by the person and the Workspace's Owners and Admins. Used to suggest Packs and who is asked for what. | Department, team (that is a Group), role (that is a Workspace Role), job title |
| **Pack Audience** (new term) | The optional part of a Pack's manifest that says whom the Pack is for: industries, segments, Business Functions, employee bands, revenue bands and countries, each from Ziffr's fixed lists. Ziffr ranks Packs by it and never hides one for it. | Target group, persona, category |
| **Test Message** (new term) | A Delivery a person sends to themselves through one Connector (email, Slack or Telegram) to see that it reaches them. It asks for nothing, cannot be answered, and never goes to anyone else. | Ping, test notification |
| About you | A step's name, not a term: the Workspace Profile's questions, the person's Business Function, and the Workspace's time zone and year start. | |
| Starting point | A step's name, not a term: from scratch, or from a Pack. | |
| Ways in and out | A step's name, not a term. It sets up Connectors and Sources and the person's Delivery Preference; the owner's word "channels" is not used. | Channels |
| First Metric | A step's name, not a term: one Metric tried both ways, with Ask me now out and a value in. | |
| Setup line, the guide's Slide-over | Not terms: the line at the top of each page is part of the Setup Guide, and its steps open in the Slide-over (GLOSSARY: Slide-over), which spec 0050 also calls the side panel. | Panel, drawer, side panel |

**GLOSSARY consequences** (ticket 1):

- **Setup Guide**, **Business Function**, **Pack Audience** and **Test Message** are added as above, with their _Avoid_ lists.
- **Trial Guide** changes to: "The Setup Guide as a Trial Workspace has it: the same steps, with the Test Metric as its First Metric and the Trial Limits on the steps that count something. Try it stays as the reference of every way." Its _Avoid_ list stays as it is.
- **Workspace Profile** gains: "Asked in the Setup Guide's About you step; it stays in the Workspace and is sent nowhere." Its _Avoid_ list stays (company profile, firmographics and the rest).
- **Pack** gains: "It may say whom it is for (its Pack Audience), which ranks it in the Setup Guide." **Test Metric** changes "for the Trial Guide to ask for" to "for the Setup Guide of a trial to ask for".
- **Group** keeps "Team" on its _Avoid_ list. The step is called **Team** because it is about the people of the Workspace, not a set of them; a Group made there is still a Group.

## User Stories

1. As a person who just signed up with a magic link and named my Workspace, I want Ziffr to take me to a first step instead of an empty page, so that I know what to do next.
2. As a new Owner, I want to say in one screen what my business does, whom it sells to, where it is and how big it is, with each question optional, so that I give what I am comfortable with.
3. As a new Owner, I want each question to say what Ziffr does with the answer, so that I can decide whether to answer.
4. As a new Owner, I want to be told plainly that my answers stay in this Workspace and are not sent to Ziffr's makers, so that I trust the questions.
5. As a person, I want to say which part of the business I work in, so that Ziffr suggests Packs that fit my work and not only my company.
6. As a person who wants to explore alone, I want a clear **Explore on my own** that leaves me with an empty Workspace and the Metric Catalog, so that nothing is made that I did not ask for.
7. As a new Owner of a SaaS company, I want the SaaS metrics Pack suggested first, with the reason, what it brings and a preview, so that I can judge it before installing.
8. As a new Owner whose business matches no Pack, I want to see every Pack anyway, so that a ranking never hides one that I would have picked.
9. As a new Owner who installed a Pack, I want the guide to make my first Metrics from it in place, so that I do not have to find **Set up from this Pack** on another page.
10. As a new Owner, I want to see on one screen how numbers can come in and how people are asked and told, so that I pick ways that fit my company.
11. As an Owner, I want each way to say whether it works here, what one click would do, and what is missing when it cannot work, so that nothing fails without a reason.
12. As a self-hoster whose Ziffr has no Slack app, I want the Slack card to say so in words and tell me where an Installation Admin adds one, so that I am not left with a button that does nothing.
13. As a person who connected Slack or Telegram, I want to send myself a test message, so that I know it reaches me before Ziffr asks anybody for a number.
14. As a person, I want to paste numbers from a spreadsheet as a way in, so that I need no program and no Connector to begin.
15. As a new Owner, I want to press **Ask me now** on my first Metric, get the Prompt where I chose, answer it there and see the value arrive, so that I know the loop works.
16. As a person whose Prompt did not arrive, I want the guide to say what to check for the way I picked and to show the Outbox entry with its reason, so that I can fix it myself.
17. As a new Owner, I want to invite colleagues by email or with a link and see in one line what each Workspace Role may do, so that I give the right role.
18. As a new Owner, I want to decide who is asked for each of my first Metrics, with a suggestion from my colleagues' Business Functions, so that the right person gets the right Prompt.
19. As a person who joins a Workspace by invitation or Domain Joining, I want a short welcome that asks only about me and how I want to be asked, so that I am never shown the Owner's setup.
20. As a Guest, I want no setup at all, so that I only see what was shared with me.
21. As a person who skips everything, I want to reach the app at once and never be sent back to the guide by force, so that I work as I like.
22. As a person who hid the guide and comes back a week later, I want to reopen it from Help and continue where the Workspace is, so that I can finish when I have time.
23. As an Owner who changes the Workspace Profile later, I want the suggested Packs to follow the new answers, so that the guide is never stuck on what I said first.
24. As a second Admin, I want the steps the first Admin did to be ticked for me too, so that we do not do things twice.
25. As an Owner, I want to see "Setup: 4 of 5 steps done" on the Workspace settings page, so that I know what is left without opening the guide.
26. As a screen reader user, I want every step, tick and button to be announced and reachable by keyboard, so that I can set up a Workspace without a pointer.
27. As a person trying Ziffr on hosted Ziffr, I want the same guide with my trial's Cups of coffee as the First Metric, so that the trial and an ordinary Workspace start the same way.

## Implementation Decisions

Everything here is proposed by this spec. The project lead's decisions are recorded under **Decisions (accepted unless the owner objects)**.

### Where things live

| What | Where |
| --- | --- |
| The guide's state, facts and ticks | `packages/core/src/setup-guide.ts` (loader and operations, Actor first) and `packages/core/src/setup-steps.ts` (pure: facts in, steps out) |
| Business Function | `packages/core/src/business-function.ts` (the list is in `@ziffr/pack`, below) |
| Pack Audience format | `packages/pack/src/audience.ts` (lists and checks), `packages/pack/src/pack.ts` (manifest field) |
| Ziffr's own Packs in the app | `packages/core/src/included-packs.ts` |
| Pack ranking | `packages/core/src/pack-ranking.ts` (pure) and `recommendedPacks(actor)` in `included-packs.ts` |
| Test Messages | `packages/core/src/test-message.ts` |
| The full page | `apps/web/src/app/setup/{page,screen,actions}.tsx` and one component per step in `apps/web/src/app/setup/steps/` |
| The Setup line and the Slide-over content | `apps/web/src/components/setup-line.tsx`, `apps/web/src/components/setup-panel.tsx` |
| Removed | `apps/web/src/components/first-run.tsx`, its call in `apps/web/src/app/dashboards/screen.tsx:174-181`, the `firstRun` facts in `apps/web/src/components/dashboard-view.tsx:42-45` |
| Kept | `apps/web/src/app/try/page.tsx` (Try it, the reference of every way), the trial bar, `trial-seed.ts`, `trial-limits.ts`, `whatWorksHere`, `askMeNowBy`, `setUpFromPack`, `installPack`, `previewPack`, the paste screen |
| Becomes a redirect | `apps/web/src/app/try/start/page.tsx` → `/setup`; its `guide.tsx` and `other-ways.tsx` are taken apart into the steps (the Feed and the n8n key move to **More ways**) |

### The steps and their ticks, from state only

A pure function `setupSteps(facts, viewer)` in `setup-steps.ts` turns facts into steps. The loader `setupGuide(actor)` reads the facts with counts and existence checks only, never values or other people's details. No step is ticked by a flag that a click sets, except the two explicit choices (skipping a step, and choosing **Explore on my own**), which are stored as choices.

| Step | Who sees it | Ticked when | Skippable |
| --- | --- | --- | --- |
| About you | Owner, Admin, Member | Owner and Admin: the Workspace Profile has an industry and a country, and the Workspace's clock was saved once (`workspaces.clock_set_at`, below). Member: their Business Function is set (to any value, "something else" included). | Yes |
| Starting point | Owner, Admin | A Pack is installed in the Workspace (`pack_installs`), or the Workspace has at least one Metric, or someone chose **Explore on my own** (`setup_guides.starting_point = 'scratch'`). | Yes |
| Ways in and out | Owner, Admin, Member | The viewer has a saved Delivery Preference for Prompts whose first way is `real` in `whatWorksHere`, or the viewer received a Test Message that was sent. For a Member, only their own preference counts. | Yes |
| First Metric | Owner, Admin | For the guide's Metric (`setup_guides.first_metric_id`): a Prompt Delivery to the viewer that was sent or is held only by Quiet Hours (out), **and** a value of that Metric submitted by the viewer through a Source (`mail`, `slack`, `telegram`, `web_form`, `api`), after the guide's Metric was picked (in). Another Admin who did both on the same Metric ticks it for everyone. | Yes |
| Team | Owner, Admin | The Workspace has a member besides the Owner who opened it, or an open invitation, or Domain Joining is on, or a Contact is a Submitter of at least one Metric. | Yes |

- **The next step** is the first one neither ticked nor skipped. **The guide is finished** for the Workspace when every step an Owner sees is ticked or skipped; the core sets `setup_guides.finished_at` the first time it computes that, and the Setup line goes away for everyone. A step that later "unticks" (the only Pack uninstalled, the last invitation revoked) does not reopen a finished guide; the Slide-over still shows the true state when reopened from Help.
- **The UTC case.** `setWorkspaceClock` (`packages/core/src/workspace-clock.ts:36`) gains one write: `clock_set_at = now()` whenever the clock is saved, changed or not. **About you** saves it with the browser's time zone proposed (`Intl.DateTimeFormat().resolvedOptions().timeZone`, checked on the server against the IANA list as today). A Workspace really in UTC ticks it by saving.
- **The year start** is asked beside the clock (`setYearStart`, `packages/core/src/fiscal-year.ts:83`). It is part of the tick only through the clock: a new Workspace has no values, so every month is allowed, and January is a fine answer to leave.
- **The Member's version** has two steps (About you, Ways in and out). When both are ticked or skipped, the Member's line goes; nothing else is stored for them.

### Data model (add-only migrations)

One migration, `2027…_setup_guide.sql`, with a header comment naming the GLOSSARY terms:

```sql
-- One row per Workspace that has had the Setup Guide (spec 0052; GLOSSARY: Setup Guide).
create table setup_guides (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  starting_point text check (starting_point in ('scratch', 'pack')),
  first_metric_id integer references metrics(id) on delete set null,
  skipped text[] not null default '{}'
    check (skipped <@ array['about', 'start', 'ways', 'first_metric', 'team']::text[]),
  updated_at timestamptz not null default now()
);
-- Each person's own side of it: when they first saw it, whether they hid it, which of their steps they skipped.
create table setup_guide_people (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  first_seen_at timestamptz,
  hidden_at timestamptz,
  skipped text[] not null default '{}' check (skipped <@ array['about', 'ways']::text[]),
  primary key (workspace_id, person_id)
);
-- A person's Business Function in one Workspace (GLOSSARY: Business Function).
create table business_functions (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  person_id text not null references profiles(id) on delete cascade,
  function text not null check (function in ('sales', 'marketing', 'finance', 'operations',
    'customer_support', 'people', 'product_engineering', 'management', 'other')),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, person_id)
);
alter table workspaces add column clock_set_at timestamptz;
```

- **Who may read and write them.** All three tables `enable row level security` and `revoke all … from public, anon, authenticated`, as the newer tables do (for example `workspace_imports`, `20270117600000_workspace_import.sql`): only the service role, so only the core, reads them. The core's rules are the real check (AGENTS rule 2): a person reads and writes only their own `setup_guide_people` and `business_functions` row; Owners and Admins read the Workspace's `setup_guides` row and every `business_functions` row of their Workspace; Members read only their own; Guests read none and write none. `select attach_demo_guard(…)` on each, so the demo can never hold a row.
- **Leaving.** A membership that ends deletes the person's `setup_guide_people` and `business_functions` rows in the same transaction as the membership (a trigger on `memberships` delete, as other per-member rows are handled), so a function never outlives the membership.
- **Moving the Trial Guide's state.** The same migration, with `ziffr.demo_seed` not needed (the demo has no trial columns set), inserts a `setup_guides` row for every Workspace with `trial_guide_step is not null`:
  - `first_metric_id = trial_test_metric_id`;
  - `finished_at = coalesce(trial_guide_finished_at, case when trial_guide_step = 'done' then now() end)`;
  - `starting_point = 'scratch'` (a trial starts from its Test Metric, which counts as a start);
  - and a `setup_guide_people` row for the Workspace's Owner with `first_seen_at = now()` (they saw the Trial Guide).
  - `trial_guide_ways` needs no copy: the guide already wrote the same choice into the Owner's Delivery Preference (`setPreference` in `saveTrialGuide`), which is what **Ways in and out** reads.
- **The old columns stay.** `trial_guide_step`, `trial_guide_ways` and `trial_guide_finished_at` are no longer written after ticket 12 and are never read again; migrations are add-only, so they are not dropped, and their columns get a `comment on column … is 'Unused since spec 0052; see setup_guides.'`. `trial_test_metric_id` stays in use: it names the Test Metric.
- **Workspaces made before this spec** that are not trials get no `setup_guides` row and are never sent to `/setup` (the redirect needs a Workspace made after the release: `setup_guides.started_at`, written by `createWorkspace`). Their Owners can open the guide from Help; opening it makes the row then.
- **The Workspace Export** (spec 0040) carries no `setup_guides`, `setup_guide_people` or `business_functions` row in version 1: the guide is about this Workspace's first days, and a Business Function is personal. An imported Workspace starts with the guide finished, since what it holds came from somewhere.

### About you

- **Questions.** The Workspace Profile's fields with their existing lists (`INDUSTRIES`, `SEGMENTS`, `COUNTRIES` with `currencyFor`, `EMPLOYEE_BANDS`, `REVENUE_BANDS`), in plain questions: "What does your business do?", "Who do you sell to?", "Where is it based?", "How many people work there?", "Revenue in a year", and "What do you work on yourself?" for the Business Function. Each has a **Skip** and one line saying what it is for: "So we can suggest Metrics and Packs that fit", "So numbers and money are written the way you write them" for the country and currency. Revenue says "in the currency above, roughly".
- **Writes.** The Workspace part through `setWorkspaceProfile` (Owners and Admins, audited as today), the clock through `setWorkspaceClock`, the year through `setYearStart`, and the function through the new `setMyBusinessFunction(actor, value | null)`. A Member's About you shows the Workspace's answers read-only (they describe the team) and asks only the function.
- **A country proposes the rest** as it does today (the currency, the Number Style and the Answer Languages follow the country until someone sets them), and the screen says so in one line.
- **The Workspace Profile becomes visible.** On **Workspace → General** the section moves from last to directly after **Name**, renamed on screen **About your business** with the glossary term in its heading's description ("the Workspace Profile"), and it gains the privacy line. It stays editable there by Owners and Admins.

### Business Function

- **The list** is fixed: `sales`, `marketing`, `finance`, `operations`, `customer_support`, `people`, `product_engineering`, `management`, `other`, shown as Sales, Marketing, Finance, Operations, Customer support, People and HR, Product and engineering, Management, Something else.
- **Why this list.** Five keys match the five function Packs (Sales, Finance, People and HR, Customer support, Operations and fulfilment), so a function always has a Pack to rank where one exists. **Management** matches the Board meeting deck and is how founders and managing directors describe themselves. **Marketing** and **Product and engineering** are the two functions most businesses have that no Pack covers yet; naming them now lets a later Pack target them and tells the owner, through the five-person trial, whether they are asked for. **Something else** keeps the question answerable for everyone. Nine is the most that reads in one look, as the industry list was cut to 18 for the same reason. Finer splits (IT apart from product, legal, procurement) wait for a Pack that needs them; adding a key is a migration and a list change, never a rename.
- **One per person per Workspace.** A person who works in two areas picks the main one. It is per Workspace because one person may be Finance in their company's Workspace and Management in their club's.
- **Who sees it.** The person on **Your profile** (a section "In this Workspace") and in About you; Owners and Admins on **Team**, as a column of the members list, and in **Who is asked for what**. Members never see another person's function; Guests are never asked and never see one. Programs never read it: no API route, MCP tool or Access Key scope returns it, and a View Link, Snapshot or Webhook never carries it.
- **Operations** (all Actor first, in `business-function.ts`): `myBusinessFunction(actor)`, `setMyBusinessFunction(actor, value)` (the person only, never for someone else, never through a key; a Guest is refused), and `businessFunctions(actor)` for Owners and Admins, returning `{ personId, function }` for members of the Workspace only. Setting or clearing one writes an Audit Log line `person.business_function_changed` with the keys only (from, to), which only Owners and Admins read.

### Pack Audience and the ranking

- **Format.** `ziffr.pack/1` gains an optional manifest field, added without a new format version because older Ziffr refuses unknown fields and a Pack that uses it states `"ziffr": ">=<the release>"` (the checks require that when `audience` is present):

  ```json
  "audience": {
    "industries": ["saas"],
    "segments": ["b2b"],
    "functions": ["management", "finance"],
    "employeeBands": ["11-50", "51-200"],
    "revenueBands": ["1m-10m"],
    "countries": ["DE", "AT", "CH"]
  }
  ```

- **Checks**, in `packages/pack/src/audience.ts`, held to the same rules as the other manifest fields (unknown and repeated fields refused, `__proto__` read as data): every part optional; each an array of distinct keys from its fixed list; at most 18 industries, 5 segments, 9 functions, 6 employee bands, 6 revenue bands and 50 countries; an empty `audience` object or an empty array is refused ("leave it out instead"). **The lists move to `@ziffr/pack`** (MIT, so Pack authors' tools check against the same keys): `INDUSTRIES`, `SEGMENTS`, `EMPLOYEE_BANDS`, `REVENUE_BANDS` and the new `BUSINESS_FUNCTIONS`, with `COUNTRIES`; `packages/core/src/workspace-profile.ts` imports them and keeps its labels, and a test fails when a list and the database CHECK constraint differ. The generated `docs/reference/pack.schema.json` and the format table in `docs/guides/packs.md` gain the field.
- **The twelve Packs are tagged** (ticket 5), for example: SaaS metrics `industries: [saas]`, `segments: [b2b]`, `functions: [management, finance]`; Online shop `industries: [ecommerce, retail]`, `segments: [b2c]`; Agency or freelancer `industries: [agency, professional_services]`, `employeeBands: [1-10, 11-50]`; Sports club `segments: [non_profit]`; Board meeting deck `functions: [management, finance]`; each function Pack its function (Operations and fulfilment also `industries: [ecommerce, retail, wholesale, manufacturing, logistics]`); Workspace usage and Ziffr operations get no audience, and their summaries say what they are for. The exact tags are reviewed in the ticket and by the five-person trial.
- **The ranking** is a pure function in `packages/core/src/pack-ranking.ts`:

  `rankPacks(answers: { industry, segment, country, employeeBand, revenueBand, functions: BusinessFunction[] }, packs: { id, name, audience? }[]): { id, score, because: Reason[] }[]`

  - For each part of the audience the Pack lists **and** the answers have, a match adds points: industry 4, function 3, segment 2, employee band 1, revenue band 1, country 1. A part the Pack does not list, or the person did not answer, adds nothing. A part the Pack lists and the answer misses adds nothing either: no Pack is pushed down for being specific.
  - `because` lists the matched parts in that order ("your industry", "your function", "who you sell to", "your size", "your revenue", "your country"); the screen joins at most two.
  - Ties go by the order Ziffr ships its Packs in (a fixed list in `included-packs.ts`: the five business Packs first, then the function Packs, then the rest), then by name.
  - **Suggested** are the first three with a score above 0. With no answers or no match, the screen says "Answer About you to get suggestions" and lists the Packs in the fixed order. **See all Packs** lists all of them, none ever left out.
  - Deterministic, no randomness, no model, no data from anyone else: the same answers always give the same list. A table test covers every rule (below).
- **`recommendedPacks(actor)`** (Owners and Admins; Members and Guests get nothing, since they cannot install) reads the Workspace Profile, the viewer's own Business Function and, as further functions, the Business Functions of the Workspace's Owners and Admins, and ranks Ziffr's own Packs plus any Pack installed already (marked "Installed" and never offered again). It returns per Pack only the manifest's name, summary, logo address, `because` and **what you get**: the counts by kind and the first names of its Metrics, Workflows, dashboards, decks, View Designs, Themes and Analysis Recipes, taken from the Pack file. Nothing of another Workspace.
- **When the answers change**, the ranking changes with them: it is computed each time the Starting point is shown, never stored. A Pack installed already stays installed.
- **Marketplace Packs are not ranked** in this spec: a Marketplace listing (`MarketplaceListing`, `packages/core/src/marketplace.ts:127`) carries no audience, and the ranking must never send the profile to the Marketplace. Where the Marketplace is on, **See all Packs** ends with "More in the Marketplace" linking to the Packs page.

### Ziffr's own Packs in the app

The Starting point cannot offer the twelve Packs while they are a download, so they come with Ziffr.

- **Bundled.** `included-packs.ts` reads `packs/*.pack.json` at build time (as the help index bundles the user guide, `apps/web/src/lib/help-index-build.ts`) into a list of file texts. The Docker image carries them with the app; nothing is fetched.
- **Installed through the one path.** `installIncludedPack(actor, packId)` looks the id up in that list (an id from the browser is matched against the list, never used as a path) and calls `installPack` with a new origin `{ source: "included", signed: true }`. A migration (add-only, a new file) replaces the CHECK on `pack_installs.source` with `('upload', 'marketplace', 'included')`. **No "The Marketplace did not check it" confirmation** for these: they are part of Ziffr's own code, checked by `starting-packs.test.ts` and `starting-packs.db.test.ts` in CI like the code. The confirmation for texts aimed at assistants stays, as for every Pack. Owners and Admins only (`assertManages`), audited as `pack.installed` with `source: included`, the Workspace Limit and the Trial Limits applying as for any install.
- **The Packs page** gains a list **Ziffr's own Packs** above **Choose a Pack file…**, with the same Preview and Install, so the guide and the page offer the same thing.
- **Updates.** A new Ziffr release with a newer version of an included Pack offers it as a new version, the same way an uploaded Pack's newer file is offered (`pack-updates.ts`), never applied by itself.

### Starting point

- **Explore on my own** stores `starting_point = 'scratch'` and opens the Metric Catalog (`/metrics/new`), filtered by the Workspace Profile as today, with a return to the guide (`?setup=1` adds a **Back to the Setup Guide** link and, on save, sets `first_metric_id` to the new Metric when none is set).
- **Start from a Pack**: Preview opens the existing preview (`previewPack` with Sample Data) in the Slide-over; Install calls `installIncludedPack`; then **Set up from this Pack** opens in place with the guide's defaults (ticket 6, in `apps/web/src/app/settings/packs/setup-defaults.ts`): the Pack's first three non-derived Metrics ticked (and the inputs of any derived one ticked with it), the person as Submitter, its first dashboard template with its Slots filled, and its first Workflow template with the person as Approver where it wants one. The person changes the ticks before **Make them**. `setUpFromPack` makes them, checked and audited as today. `first_metric_id` becomes the first Metric made.
- **A Workspace that has Metrics already** (an Admin made some, or an import) shows the step ticked with "You have 4 Metrics. Start from a Pack anyway?".
- **A Member** never sees the Starting point: they cannot install a Pack or make a Workflow from one.

### Ways in and out

- **What each way shows** comes from `whatWorksHere(actor)` (`packages/core/src/what-works-here.ts:35`) and nothing else, so the guide cannot say "ready" while the queue keeps a message back. Per way, one of: **ready**, **one click** (the action and who may do it), or **missing here** (the reason `whatWorksHere` already writes, followed by what to do).
- **One click, where it can be one:**
  - Slack, connected per Workspace: **Add to Slack** for Owners and Admins (`connectSlack`, the existing OAuth flow, returning to `/setup?step=ways`); a Member sees "An Owner or Admin connects Slack" and, once connected, **Link my Slack** only where the address does not find them.
  - Telegram: **Turn on Telegram** for Owners and Admins, then **Connect my Telegram** (the one-time link, `myTelegramLink`), for everyone, in one card.
  - Email: nothing to set up where the Installation has a mail server; replies work where inbound mail is set up, and the card says which.
  - Web form: always ready, nothing to set up.
  - Paste: **Try it** opens `/paste-values` (spec 0026, `packages/core/src/paste-values.ts`), the easiest way in for someone with a spreadsheet; it records through the web form Source, so a Metric that refuses the web form is said to refuse pastes too, as the paste screen says.
- **Missing here, in words, to the right person.** Where the Installation lacks something (no mail server, no Slack app, no Telegram bot), the card says it, says that "whoever runs this Ziffr" adds it on the Installation settings page, and links `docs/guides/self-hosting.md`'s section for it. Where the viewer is an Installation Admin (`isInstallationAdmin`), it links the Installation settings page itself. The guide never shows a button for a way that cannot work here.
- **How you are asked** is the viewer's own Delivery Preference for Prompts, up to three ways in order (GLOSSARY: Delivery Preference), saved through the existing `setPreference` with only ways that are `real` here, as `saveTrialGuide` checks today. It is the one choice this step saves for everyone; a Member saves their own.
- **How people are told** is not set up in the guide: Alerts, a Workflow's Tell step, Snapshots by email, View Links and Webhooks each need a Metric or a dashboard first. The step names them in one line with links to their user guide chapters.
- **More ways**: Access Keys (`/settings/keys`), assistants (`/settings/assistants`), Feeds (`/settings/feeds`, including the warehouse Feeds of spec 0048 and the Automation Templates of spec 0043), and **Send values** (`/connectors/send`). In a trial, the Trial Guide's **Make a key for n8n** (`makeGuideFeedKey`) stays here as one of the more ways.

### Test Messages

- **New core operation** `sendTestMessage(actor, way: "email" | "slack" | "telegram"): Promise<TestMessageResult>` in `packages/core/src/test-message.ts`. The recipient is always `actor.personId`: there is no parameter that names a person, an address, a Slack user or a chat. Email goes to the person's own sign-in address (proven by signing in), Slack to the Slack user the Workspace's connection found by that address or linked by code, Telegram to the chat the person linked. Never through a key (`actor.key` refused), never in the demo, never for a Guest.
- **The message** is fixed text with only the Workspace's name and the way: "This is a test from Ziffr for <Workspace>. If you can read it here, Ziffr reaches you on <Slack>." No values, no Metric, no other person's name, no link but the Workspace's address. It cannot be answered: no reply address, no buttons.
- **Through the one queue.** It is a Delivery of a new kind `test`, made through `deliverPlain` (`packages/core/src/deliveries.ts:254`) with `via` set, so the trial checks, the Sending Limits and the Outbox apply as to every message. A migration (add-only) adds `test` to the `deliveries.kind` CHECK (the latest list is in `20270121000000_heads_up_delivery.sql:106`). It is **not** held by Quiet Hours: the person asked for it now, and it reaches only them.
- **Limits.** At most 3 Test Messages per person per way per 10 minutes and 20 per person per day, claimed in the database under a lock as the other Connector limits are; in a trial they count towards the messages a day of the Trial Limits, and the day's cap is 5 per person, so tests cannot use up the trial's messages. Over a limit, the result says which limit and when it resets.
- **What the person sees.** The result per way: "Sent", "Waiting to be sent", or "Kept in the Outbox" with the reason through `shownReason` (`packages/core/src/ask-now.ts:40`), so no provider's own words reach the browser.
- **Audit.** `connector.test_sent` with the way and the outcome only (sent, queued, kept, refused), never the address or chat.

### First Metric

- **Which Metric.** `setup_guides.first_metric_id`, set by the Starting point; **Another Metric** lists the Metrics the viewer may see and owns. In a trial it starts as the Test Metric (`trial_test_metric_id`). With none, the step offers the Metric Catalog with the return link.
- **Make Ask me now possible.** `canAskNow` (`packages/core/src/ask-now.ts:19`) needs the viewer to own the Metric and submit it. When they own it but do not submit it, the step offers **Ask me for it**, which adds the viewer as a Submitter through the existing Submitter operation (audited as any change of Submitters). When someone else owns it, the step says who and offers another Metric.
- **Out.** **Ask me now** calls `askMeNowBy(actor, metricId, ways)` with the viewer's chosen ways (email when only the form link is picked), exactly as `askTrialGuide` does; the ten-minute wait of Ask me now applies, and the button says when it may be pressed again. Each result is shown with what to look for: the email's subject, "a direct message from the Ziffr app in Slack", "a message from @<bot> in Telegram".
- **In.** The viewer answers where it arrived (a reply, a Slack or Telegram answer), on the form link the Prompt carries (shown on the step after asking, as `askTrialGuide` returns `formCode` today: the viewer's own code only), or by pasting. `setupFirstValue(actor)` generalises `trialGuideValue` (`packages/core/src/trial-guide.ts`) to the guide's Metric and the viewer's own values; the step polls it every 5 seconds for at most 10 minutes, then asks the person to press **Check again**.
- **Quiet Hours.** A Prompt asked during the viewer's Quiet Hours waits for their end (`deliveries.ts:59-61`). The step says so before asking ("You are in your Quiet Hours until 07:00: the request will wait") and counts a held Prompt as out, so nobody is stuck at night.
- **When nothing arrived**, the step shows, for the way picked: email (the spam folder, the address it went to, "this Ziffr keeps email in the Outbox" where mail is simulated), Slack (the app's messages tab, whether Slack found the person by their address), Telegram (whether the person is connected, whether they blocked the bot), and always the Outbox entry with its reason.
- **Done** when out and in both happened, with what arrived: "MRR for November 2026: 48,200 EUR, by email reply. The loop works."

### Team

- **Invite** through the existing `inviteByEmail` and `createInviteLink` (`packages/core/src/invitations.ts:129, 204`), with every limit they have, the Trial Limits in a trial; each Workspace Role explained in one line from one place in the code (the same words the Team page uses). **Domain Joining** through `setJoinDomain`, offered with the Owner's own domain and off in a trial (spec 0040). **A first Group** through the existing Group operation, optional.
- **Who is asked for what** lists the Metrics made in the guide with their Submitters, and lets an Owner or Admin pick others through the existing Submitter operation (the Who gets what page's rules). Where members gave a Business Function, people whose function matches a Metric's Pack Audience functions are listed first as "suggested: Ben (Finance)". The suggestion is shown only to Owners and Admins, who may see functions anyway, and never changes anything without a click.
- **Does a Contact count?** Yes, when the Contact is a Submitter of at least one Metric: a field worker who answers by Telegram is a team of its own kind. A Contact that only exists does not tick the step.

### The Setup line, the Slide-over and opening by itself

- **The line** is drawn by the app layout (`apps/web/src/app/layout.tsx`, next to the trial bar) from `setupGuide(actor)` when the viewer has unfinished steps of their own and has not hidden it, and never in the demo, for a Guest, on a View Link or on the full `/setup` page. In a trial it sits under the trial bar.
- **The Slide-over** content (`setup-panel.tsx`) is opened through `useSlideOver().open`, with the address `?panel=setup` so a reload keeps it (spec 0050). Each step's screen is a component used by both the full page and the Slide-over.
- **Opening by itself.** `apps/web/src/app/page.tsx` replaces its `trialGuidePending` check with `setupGuidePending(actor)`: true when the Workspace has a `setup_guides` row, the viewer is an Owner, Admin or Member, and the viewer's `setup_guide_people.first_seen_at` is empty. It redirects to `/setup`; `/setup` writes `first_seen_at` on its first render. So the guide opens by itself once per person per Workspace, and never again by force. `createWorkspace` in `auth-actions.ts` redirects to `/setup` for every new Workspace; `acceptInvite` and an approved join request keep redirecting to `/`, which then sends the new member to `/setup` for their short version.
- **Hide** writes `hidden_at` for the viewer only. **Reopen** from Help (the Slide-over's contents list gets **Setup Guide** on top while unfinished, at the bottom after) and from the person's menu clears `hidden_at`.
- **Facts for Owners.** The Workspace settings page shows "Setup: 4 of 5 steps done" with **Open the Setup Guide**, from the same `setupGuide(actor)`.

### Trials, the demo and self-hosted Ziffr

- **Trial-only, and stays so:** the Trial Limits (`trial-limits.ts`) and the usage line, the trial bar and its days, the Test Metric seed (`trial-seed.ts`) and its Workflow and dashboard, the welcome page's trial wording, Try it, the trial's end. **Becomes general:** the steps, the ways and their one-click setup, Ask me now as the test, the value polling, the Feed key as one of the more ways, the guide's state.
- **In a trial** the Starting point shows "Your trial starts with Cups of coffee" and ticks itself (`starting_point = 'scratch'` from the migration and from the seed); the Packs may still be installed within the Trial Limits. Spec 0040's invitation gate (invitations open after the Owner's first value) shows on the Team step as "Invitations open once your first value has arrived", which the First Metric step brings.
- **The demo** never has a `setup_guides` row (the demo guard refuses it), never redirects to `/setup` (`/setup` redirects to `/` in the demo as `/try/start` does today), and keeps its guided steps in `tour.tsx`.
- **Self-hosted** Ziffr uses the guide unchanged. No step depends on Ziffr Cloud, the Marketplace or hosted Ziffr: Ziffr's own Packs come with the image, the ways read the Installation's own settings, Test Messages go through the Installation's own mail server, Slack app and bot. Without any of them, the web form and paste still let the First Metric step finish.

### Edge cases

- **The Owner leaves midway** or hands the Workspace over: the progress is the Workspace's, so the next Owner or an Admin sees the same ticks. `first_metric_id` may point at a Metric the leaver owned; it is handed over with the Metric (GLOSSARY: Metric Owner), and the First Metric step offers the new owner **Ask me for it**.
- **Two Admins at once.** Ticks come from state, so both see the truth on their next load. Skips are an array updated with `array_append … where not skipped @> …` in one statement, so two skips never lose one; `finished_at` is set with `where finished_at is null`. Two installs of the same Pack meet the existing unique install ("is installed already").
- **The Profile changed later** changes the ranking at once (it is never stored) and never uninstalls or changes anything.
- **A Pack installed already** appears as "Installed" with **Set up from this Pack**, ticks the Starting point, and is never offered for a second install.
- **The guide's Metric deleted or archived**: `first_metric_id` is set null by the foreign key, or the step treats an archived Metric as none, and asks for another one.
- **A Workspace at its Workspace Limit or Trial Limit**: Set up from this Pack shows its existing refusal (`roomFor`), and the step suggests fewer Metrics.
- **No Slack app, no Telegram bot, no mail server** on the Installation: the cards say so; email Test Messages are kept in the Outbox with "This Ziffr has no mail server"; Ask me now goes to the Outbox the same way and the step says the First Metric can still finish through the form link or a paste.
- **The person is in Quiet Hours**: Ask me now is held (and counts as out); Test Messages are not held.
- **Offline or a slow network**: every step saves through a server action that returns what went wrong instead of throwing it (the house pattern, `apps/web/src/lib/action-result.ts`); the polling stops after 10 minutes; nothing is kept in the browser but the Slide-over's width.
- **A person in several Workspaces** has one `setup_guide_people` row per Workspace; switching Workspace shows that Workspace's guide.
- **A Member promoted to Admin** sees the Owner's steps from then on, with the Workspace's progress.

## Security and privacy decisions

- **Nothing leaves the Installation.** The Workspace Profile, Business Functions, the guide's state and the ranking stay in the Installation's database and are read only by the core. Nothing is sent to Ziffr's makers, Ziffr Cloud, the Marketplace or anyone else; Ziffr Cloud's API keeps reading a Workspace's numbers only, never a name, a Metric, a value or a person (`docs/reference/cloud-api.md`, spec 0029). There is no telemetry and no event is recorded for the guide beyond the Audit Log lines below. Using the profile centrally, for example product analytics on ziffr.net, is **out of scope**: it would change what Ziffr promises, needs its own ADR and the owner's decision, and is not done by this spec.
- **The privacy statement**, in the same words on About you, on **Workspace → General** and in the user guide: "What you answer here stays in this Workspace. It is not sent to Ziffr's makers or to anyone else, and it is used only to suggest Metrics and Packs here and who is asked for what. Owners and Admins of this Workspace see your function; other members do not." On hosted Ziffr the user guide adds that ziffr.net runs the database, as for everything else in the Workspace (see `docs/security/`).
- **Visibility of the Business Function** (AGENTS rule 3): the person and the Workspace's Owners and Admins only, enforced in the core (`business-function.ts`) and by the tables' RLS (no role but the service role reads them). Not in pages Members or Guests see, not in search, Versions, Threads, the API, the MCP Server, Webhooks, View Links, Snapshots or the Workspace Export.
- **Why it is not sealed with the Workspace Key.** The Workspace Key seals values, the words people write and Contacts' details (ADR 0012). A Business Function and the Workspace Profile are keys from fixed lists that describe work, not content, and the ranking reads them; they stay unsealed like a Workspace Role. If the owner wants them sealed, it is one column change in the core's sealed list and no change to the rules above.
- **Test Messages cannot reach anyone else.** No parameter names a recipient; the address is the sign-in address the person proved; Slack and Telegram reach only the account the person linked or the address found; the text is fixed; limits per person and way; audited; no Quiet Hours bypass for anything but this message to oneself; refused through keys, in the demo and for Guests.
- **Input from the browser** (AGENTS rule 4): every answer is checked against its list on the server (`checkProfile`, the function list, the step names, the way names); a Pack id is matched against the bundled list, never used as a path; `first_metric_id` is accepted only for a Metric of the Workspace the viewer may see.
- **Pack Audience is untrusted input** like the rest of a Pack: checked keys from fixed lists, sizes capped, nothing in it is rendered as markup or used to build a query.
- **Audit Log.** `workspace.profile_changed` and `workspace.clock_changed` as today; new `person.business_function_changed` (keys only), `connector.test_sent` (way and outcome), `pack.installed` with `source: included`, and `setup.step_skipped` and `setup.finished` (step names only). The guide's ticks themselves write nothing: they are read from state.
- **Threat model** (ticket 13): an entry "Learning about a person or business through the Setup Guide" (visibility of functions, nothing sent anywhere, the Export leaves them out) and "Using Test Messages to message others" (no recipient parameter, limits, fixed text), each with the tests that check it.

## Testing Decisions

- **The ranking, as a table** (`pack-ranking.test.ts`): no answers gives the fixed order and no `because`; each part alone (industry, function, segment, band, revenue, country) matches and gives its reason; two parts in the order of points; a Pack that lists a part the person did not answer is not pushed down; a Pack with no audience is ranked in its fixed place; ties by the fixed order then the name; the same input twice gives the same output; every one of the twelve Packs appears in **See all** for every row of the table. One row per tagged Pack checks that its intended answers put it in the top three.
- **The steps, from state** (`setup-steps.test.ts`, pure): a table of facts against the steps an Owner, an Admin, a Member and a Guest see, which are ticked, which is next and when the guide is finished; the UTC Workspace ticks by saving the clock; a skipped step counts as done for "finished" but not as ticked.
- **The loader against the database** (`setup-guide.db.test.ts`): each tick with the real rows (a Pack installed, a Metric made, a Delivery Preference saved, a Prompt sent and a value through each Source, an invitation, Domain Joining, a Contact as Submitter); two Admins skipping at once lose nothing; the migration of a trial's `trial_guide_*` columns into `setup_guides` (finished, unfinished, at Done without `finished_at`); a Workspace made before the release is never redirected.
- **Visibility** (`business-function.db.test.ts`): the person reads and writes their own; an Owner and an Admin read every member's; a Member reads only their own; a Guest is refused both; a key is refused; another Workspace's rows never appear; leaving the Workspace deletes the row; no API route or MCP tool returns a function (a test over the route and tool lists).
- **Pack Audience** (`packages/pack`): valid and invalid audiences (unknown key, repeated key, too many, empty, wrong type, an unknown part, `__proto__`), the `ziffr` range required with it, the twelve Packs pass, the lists equal the database CHECK constraints.
- **Ziffr's own Packs**: each installs through `installIncludedPack` with `source: included` and without the unsigned confirmation; an unknown id is refused; a Member cannot install; the Workspace Limit and the Trial Limits apply; a newer bundled version is offered, not applied.
- **Test Messages with the fakes** (Mailpit, the fake Slack API, the fake Bot API, as spec 0021's tests): each way sends one message to the person only; a person without a Slack link or Telegram chat gets "Kept in the Outbox" with the reason; the limits hold under parallel presses; a trial counts them in its messages a day; a key, the demo and a Guest are refused; Quiet Hours do not hold it; the Audit Log line holds no address.
- **The modes**: the demo never shows the line, the redirect or `/setup` (a test in `demo-read-only.db.test.ts`); a trial opens `/setup` with the Test Metric as its First Metric and `/try/start` redirects there; a self-hosted settings matrix (no mail, mail without inbound, no Slack app, no bot, all of them) against what each card says, through `whatWorksHere`, as spec 0021's test does.
- **Accessibility**: every step is a heading with its state in text ("done", "skipped", "next"), not colour alone; the step list is an ordered list; focus moves to the step's heading when it opens and returns to **Continue** when the Slide-over closes (the host's own tests cover the rest); every control is reachable by keyboard; the polling result is announced in a polite live region; checked with axe in the Playwright pass and by hand with VoiceOver.
- **In the running app** on a second Supabase stack: sign up, the full guide with a Pack, Slack through the dev tunnel and Telegram by polling, a Member joining by link, a Guest, skipping everything, hiding and reopening a week later (the clock moved in the test).
- **The five-person trial** (ticket 14): the owner watches five people new to Ziffr, of different businesses and functions, set up a Workspace with no help, and notes where each stopped, what they skipped and why, whether the suggested Pack was the one they would have picked, and whether the First Metric arrived. The findings become changes to the words, the tags or the steps before the spec is marked done.

## Tickets

Each is one pull request, a sub-issue of the spec's tracking issue, labelled `spec:0052`. Opened only after the owner accepts the spec.

1. **Words and the guide's state.** GLOSSARY (Setup Guide, Business Function, Pack Audience, Test Message; Trial Guide, Workspace Profile, Pack and Test Metric changed); the migration with `setup_guides`, `setup_guide_people`, `business_functions` and `workspaces.clock_set_at`, RLS, demo guards and the move of the Trial Guide's state; `setup-steps.ts` (pure) and `setup-guide.ts` (loader, skip, hide, reopen, finish); `setWorkspaceClock` writes `clock_set_at`. **Blocked by:** nothing. **Done when:** the step table test and the DB tests of ticks, skips and the trial migration pass, and the upgrade test passes on a database with trials.
2. **Business Function.** `business-function.ts` (own read and write, the Owner and Admin list, audit), the list in `@ziffr/pack`, **Your profile → In this Workspace**, the Team page column for Owners and Admins, the leaving trigger. **Blocked by:** 1. **Done when:** the visibility DB tests pass, and a Member's page, the API and the MCP tools never show another person's function.
3. **About you.** The `/setup` page shell with the step bar, About you for Owners, Admins and Members, the clock and year start in it, the privacy line, and the Workspace Profile moved up on **Workspace → General** as **About your business**. **Blocked by:** 1, 2. **Done when:** a new Owner can answer or skip every question, the UTC Workspace ticks, and the screen is tried in the running app with a keyboard and VoiceOver.
4. **Ziffr's own Packs in the app.** `included-packs.ts`, the build step, origin `included` and its migration, `installIncludedPack`, **Ziffr's own Packs** on the Packs page, newer bundled versions offered. **Blocked by:** nothing. **Done when:** each of the twelve installs from the Packs page on a self-hosted stack with no Marketplace, and the tests above pass.
5. **Pack Audience and the ranking.** The manifest field and its checks in `@ziffr/pack`, the generated schema and `docs/guides/packs.md`, the twelve Packs tagged, `pack-ranking.ts` with its table test, `recommendedPacks(actor)`. **Blocked by:** 2 (the function list), 4. **Done when:** the table test passes and every tagged Pack reaches the top three for its intended answers.
6. **Starting point.** The two choices, the ranked list with reasons and **What you get**, Preview in the Slide-over, Install, **Set up from this Pack** in place with the guide's defaults, **Explore on my own** with the catalog's return link, `first_metric_id`. **Blocked by:** 3, 5. **Done when:** a new Owner goes from About you to their first Metrics from a Pack, or to a Metric from scratch, without leaving the guide.
7. **Test Messages.** `test-message.ts`, the `test` Delivery kind and its migration, the limits, the Audit Log line, the Outbox label "Test", the tests with the fakes. **Blocked by:** 1. **Done when:** the fake-backed tests pass and a test proves no other person can be reached.
8. **Ways in and out.** The two questions, the cards from `whatWorksHere`, the one-click actions (Add to Slack and back, Turn on and Connect Telegram), the words for what is missing (with the Installation Admin's link), the Delivery Preference, **Send me a test**, paste, **More ways** with the trial's n8n key. **Blocked by:** 1, 7. **Done when:** every combination of the self-hosted matrix shows the right card, tried in the running app with Slack through the dev tunnel.
9. **First Metric.** Picking the Metric, **Ask me for it**, Ask me now by the chosen ways, the form link, `setupFirstValue` and the polling, Quiet Hours, **Didn't arrive?**, the tick from both directions. **Blocked by:** 6, 8. **Done when:** a Prompt by email, Slack and Telegram is answered and ticks the step on a second stack, and a simulated mail Ziffr still finishes through the form link.
10. **Team.** Invite by email and link, the roles in one line each, Domain Joining, a first Group, **Who is asked for what** with function suggestions, the tick rules (a Contact as Submitter counts), the trial's invitation gate shown. **Blocked by:** 1, 2. **Done when:** each tick rule has a DB test and the step is tried in the running app.
11. **The Setup line, the Slide-over and opening by itself.** The line in the layout, the guide in the Slide-over (`?panel=setup`), Hide and reopen from Help and the person's menu, `setupGuidePending` in `app/page.tsx`, `createWorkspace` and the member redirect, the Member's short version, nothing for Guests, "Setup: n of 5" on Workspace settings; `first-run.tsx` and its facts removed. **Blocked by:** 3, 6, 8, 9, 10. **Done when:** a new Owner, a joining Member and a Guest each meet what the spec says, and the first-run checklist is gone.
12. **Trial, demo and self-hosted.** The Trial Guide becomes the Setup Guide of a trial: `/try/start` redirects to `/setup`, the Test Metric as First Metric, the trial bar's link, `trialGuidePending` removed from `/try` and `/`, `try/start/*` taken apart, the old columns no longer written; the demo's refusals and the guard; the self-hosted matrix test. **Blocked by:** 11. **Done when:** a new trial on a second stack goes through the guide to its first value and invitation, and the demo shows none of it.
13. **Documents and the review.** `docs/user-guide/07-getting-started.md` rewritten around the guide (its nine steps become the guide's five and what comes after), the chapters on Workspace settings (16), your settings (17), Packs (19) and the words (90), the help route for `/setup` in `apps/web/src/lib/help-routes.ts`, the threat model entries, `docs/guides/packs.md`, the self-hosting guide's line on Ziffr's own Packs, a release note in `.changeset/`, and an Opus security review of the whole spec's diff. **Blocked by:** 1 to 12. **Done when:** Vale and the docs audit pass, the review's findings are fixed, and the help panel opens the right chapter on `/setup`.
14. **The five-person trial.** The owner runs it with the kit from ticket 13 (a short script, the five profiles, what to watch), and the findings are filed as tickets or folded into the words and the Pack tags. **Blocked by:** 12 (13 for the kit). **Done when:** the owner has written the findings into the spec's Further Notes and marked the spec done or opened follow-ups.

## Out of Scope

- **Central use of the profile or of Business Functions**: product analytics on ziffr.net, sharing the answers with Ziffr Cloud or the Marketplace, or ranking Marketplace Packs by sending the profile there. Each would need its own ADR and the owner's decision.
- **CSV and spreadsheet file upload.** Paste is the easiest way in and exists (spec 0026); a file upload brings a parser for a file format, encodings and an upload path to check. It is a later ticket, if the five-person trial asks for it.
- **An assistant or a model that sets up a Workspace** ("describe your company and Ziffr builds it"): the guide is fixed steps with deterministic suggestions.
- **Localisation of the guide** beyond what Ziffr has (English screens, Answer Languages for answers).
- **Payments, Sizes and subscribing** inside the guide.
- **Seeding an ordinary Workspace with made-up numbers.** A Pack's Preview uses Sample Data; a Workspace holds only what its people make.
- **Ranking Metric Catalog entries by Business Function**: entries have no functions field; the catalog keeps its industry and segment filter.
- **A Business Function list per Workspace**, or several functions per person.
- **Changing the demo's guided steps** (`tour.tsx`), which spec 0051 owns.

## Decisions (accepted unless the owner objects)

The project lead decided these on 2026-11-23 for the owner to review:

1. **One flow for every Workspace, the Setup Guide.** The Trial Guide becomes the trial's use of it: the Trial Limits, the Test Metric seed and the trial bar stay trial-only; the steps, the ways, Ask me now as the test and the guide's state become general. The first-run checklist "Get your workspace ready" is removed. The Trial Guide's state moves into new tables by an add-only migration; its columns stay, unused, except `trial_test_metric_id`.
2. **Proactive at the first sign-in.** After the sign-in and the Workspace's name, the new Owner lands in the Setup Guide. Someone who joins an existing Workspace gets a short version (a welcome, their About you, how they are asked, where the team's numbers are), never the Owner's steps. Always skippable, reopenable from Help and the person's menu, never blocking.
3. **About you** asks the Workspace Profile's fields in plain questions on one screen, each skippable and saying what it is for, plus the new per-person **Business Function** (the list above), seen only by the person and Owners and Admins, plus the time zone and the year start (which ends the "UTC can never tick" problem). Everything stays inside the Workspace: no telemetry; a privacy statement in the threat model and the user guide; the Profile moves up on Workspace settings and stays editable there.
4. **Starting point**: "Explore on my own" or "Start from a Pack", with a ranked list from the new optional manifest field **Pack Audience** and a simple, deterministic and explainable rule; the twelve Packs tagged; no Pack ever hidden; installing through the existing path and permissions by a click; then the first Metric made from it in place. Ziffr's own Packs come with the app so the list is installable without a download.
5. **Ways in and out as one conversation**: email, web form, Slack and Telegram first, Access Keys, n8n, Feeds and warehouse Feeds as more ways, paste as the easiest way in; the shortest setup, saying what is missing when it cannot; a new **Test Message** per way, Actor first, rate-limited, audited and to oneself only. CSV upload is a later ticket.
6. **First Metric, both ways**: Ask me now out, a value through a Source in, ticked from state, with what to expect and what to check. The Test Metric stays for trials.
7. **Team**: invite by email or link, Domain Joining, optionally a Group, roles in one line each, who is asked for what; skippable; ticked by another member, an open invitation, Domain Joining or a Contact who submits.
8. **The panel** is the Setup line plus the guide in the Slide-over of spec 0050 (which exists: `slide-over-host.tsx`); steps ticked from state, the next one highlighted, Skip per step, Hide per person, reopenable; progress per Workspace, shared by Owners and Admins; Members see only their steps; Guests nothing.
9. **Demo and trial**: the demo never shows the guide; a trial uses it with its limits and its Test Metric; self-hosted Ziffr uses it unchanged, and missing Slack, Telegram or mail is handled in words.
10. **Measuring without telemetry**: the owner's five-person trial, and the facts an Owner sees in their own Workspace ("Setup: 4 of 5 steps done").

## Open questions for the owner

1. **The Business Function list.** Proposed: Sales, Marketing, Finance, Operations, Customer support, People and HR, Product and engineering, Management, Something else. **Recommendation:** accept these nine; add a key only when a Pack needs it.
2. **May a Workspace's Owners and Admins see members' functions?** **Recommendation:** yes, as proposed: it is what makes "who is asked for what" useful, the field says so where it is asked, and Members never see each other's.
3. **Do Members who join see a guide at all?** **Recommendation:** yes, the short version (welcome, their function, how they are asked), skippable, once; Guests never.
4. **How long does "Hide" last?** **Recommendation:** until the person reopens it, per person per Workspace; the line also goes for everyone once every step is ticked or skipped. No reminder brings it back.
5. **CSV file upload in this spec?** **Recommendation:** no; paste from a spreadsheet covers the first values, and a file upload is a later ticket if the five-person trial shows people need it.

## Further Notes

- **Checked against the brief.** Three points differ from the inventory this spec was written from: three of the twelve Packs (SaaS metrics, Online shop, Agency) already set `industries` on their Metric entries; none of the twelve can be installed from inside the app (they are a download, and the Marketplace is off by default with no trusted key in `MARKETPLACE_PUBLIC_KEYS`), which is why ticket 4 exists; and the glossary's Trial Guide already lists an "inviting colleagues" step (spec 0040) that `GUIDE_STEPS` does not have yet, which the Team step here provides.
- **Why not extend the checklist instead.** The checklist is drawn only on an empty Dashboards page and disappears with the first dashboard, so it can neither be proactive nor stay until the work is done; its ticks are partly fixed in code. The Trial Guide has the right shape (steps, skip, reopen, ways from `whatWorksHere`, Ask me now) and only the wrong scope.
