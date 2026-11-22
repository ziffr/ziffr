# 0043 Automation Templates for Feeds: a Pack's Metrics fill themselves from the systems people already use

**Status:** draft. **Ticket:** #769 (the owner's wish, 2026-11-22); the tracking issue is #769 and its sub-issues are labelled `spec:0043`.

## Problem Statement

A Pack (spec 0030) gives a team the Metrics, the dashboard and the Workflow for, say, HR. It does not give them the numbers. Someone is asked each month, which is Ziffr's point for numbers that live in people's heads, but a great many of the numbers of a business already sit in a spreadsheet, a billing system or a CRM, and a person asked to retype them will stop answering. A Feed (spec 0012) fills Metrics from another system, but writing one is work most teams will not do, and Ziffr cannot write and maintain a program for every system (ADR 0006, ADR 0013).

An importable automation for n8n already exists in the other direction (spec 0034: Automation Templates join a Webhook to Microsoft To Do, Google Tasks and others), and a plain n8n flow that sends one number to a Feed is in the [Feeds guide](../guides/feeds.md). What is missing is the step between: a ready flow per source that fills the Metrics of a Pack, and a way to get it from Ziffr already pointing at the right Workspace and Metrics.

## Solution

1. **Automation Templates for Feeds**: importable n8n workflows in the repository, one per source, each reading a few figures from the other system on a schedule and sending them to a Feed's endpoint with `@ziffr/feed-kit`'s rules (the period's first day, an idempotency key, no value twice). The first three: **Google Sheets** (a range of a sheet becomes values of named Metrics: the one that most teams already have), **Stripe** (MRR, customers, churned customers) and **HubSpot** (deals won, new contacts). More only where the demand shows.
2. **Get this flow from Ziffr**: on a Metric's "Who submits" and on the result of **Set up from this Pack**, Owners and Admins choose **Fill from n8n**, pick a template, and download it with the address of their Ziffr and the slugs of their Metrics already in it. Nothing in the file is a secret unless they ask for one.
3. **A Pack names its templates**: a Pack's manifest may say which templates fill which of its entries, so the page after **Set up** reads "Fill these Metrics automatically: Google Sheets, Stripe" with the download.
4. **A prompt for an assistant**, a smaller way for people with no n8n: Ziffr writes, from a Metric, a text they may paste into their own assistant (one with Ziffr's MCP Server and a tool for the other system) to fill past periods once. It is for one-off backfills, never a schedule.

**Ziffr never runs the flow or holds the other system's credentials** (ADR 0006): n8n runs it where the person put it, and they keep the other system's login in n8n. Ziffr only writes a file and, if asked, makes a Feed Key.

## User Stories

1. As an Owner who just set up the HR Pack, I want my headcount and attrition to fill from the sheet HR already keeps, so that nobody retypes it each month.
2. As an Owner, I want to download an n8n flow that already has my Ziffr's address and my Metrics' slugs, so that importing it and adding my sheet's login is all there is to do.
3. As an Owner, I want the Feed Key shown once beside the download, not written into the file, so that a flow I email or commit does not carry a secret.
4. As an Owner who is content to keep the key in the file, I want to say so and get one that works only for these Metrics, so that importing is one step.
5. As an Admin, I want what a template sends to be limited to what its Feed Key may write, so that a mistake in a flow cannot touch other Metrics.
6. As a Pack creator, I want to say which template fills which of my entries, so that my Pack's buyers get my fast start.
7. As a person with no n8n, I want a text for my assistant that fills the past twelve months once, so that my dashboard is not empty on its first day.
8. As a maintainer, I want every template tested against the real Feed endpoint, so that a change to Ziffr cannot silently break all of them.
9. As a self-hoster, I want the templates and the download to work on my Installation with no connection to anyone, so that nothing about my Ziffr leaves it.

## Implementation Decisions

### Words

No new term. **Automation Template** (GLOSSARY) already means an importable file for an automation tool that joins Ziffr to another system; it now covers both directions: a Webhook out to another system (spec 0034), and another system in through a Feed (this spec). The glossary entry says both. A template is not a Workflow (an n8n or Zapier flow that sends values is an automation, never a Workflow: see **Feed**), and not a Recipe, a plugin or an integration (the _Avoid_ words).

### The templates

- **Where:** `automation-templates/feeds/<source>.n8n.json` in the repository, MIT-licensed like the other things programs are built on (ADR 0002), each with a `README.md` of how to import it, what it reads, and what it sends. They are listed by id in one file, `automation-templates/feeds/index.json`, which `@ziffr/pack` and the app read.
- **What one holds:** a schedule trigger, the nodes that read the other system, a node that shapes figures into `{ metric, period, value }`, and an HTTP Request node that sends them to the Feed endpoint with Header Auth (the key in n8n's credential, never in the file). Slugs, the Ziffr address and the period come from named `Set` nodes at the top, so that the download changes only those.
- **What is checked in the repository:** the file parses as an n8n workflow; it holds no key, token or address other than a placeholder (`https://ziffr.example.com`, `your-metric-slug`); every node's type is one n8n ships; a test sends what the shaping node produces to a test Installation's Feed endpoint and reads the values back (as spec 0034 does for events), with a fake source node standing in for the system.
- **What they do not do:** they never write to the other system, never ask for more than read access to it, and send only values and Breakdowns (Feeds guide).

### Get this flow from Ziffr

- **Where:** Owners and Admins, on a Metric's **Who submits** and on the result of **Set up from this Pack**: **Fill from n8n** lists the templates that fit (by id, from `index.json`), asks which Feed (or makes one: a Feed is made by an Owner or Admin as today), and **Download**.
- **How it is made:** a core function `automationTemplateFor(actor, { template, feed, metrics })` takes the Actor first, reads the template, checks the Feed is a live Feed of the Workspace and every Metric is one the Feed submits to (a Metric the Feed does not submit to is added to its Submitters first, by the person, in the same step, through `addFeedToMetric`), and returns the file with its placeholders replaced. Slugs are checked against the Metric slug pattern before they are written, so a name from the browser never becomes part of the file's structure; the file is built by setting values in the parsed workflow, never by editing its text.
- **What is in it:** the Ziffr address of the Installation and the Metrics' slugs. **No Feed Key** unless asked.
- **The key:** by default the page shows a new Feed Key once, beside the download, to paste into n8n's credential. A person who chooses **Put the key in the file** gets a file that holds a Feed Key made for it, with an end date within a year (the rule for every Feed Key) and the usual scope (only the Feed's Metrics, never values or people); the page says plainly that the file is now a secret. The key is made for that download, and Ziffr keeps no copy of the file.
- **Audited:** `feed.template_downloaded` with the template's id, the Feed and the number of Metrics, never the file.
- **Visibility:** a Metric is offered only to someone who sees it and may change who submits to it. The file holds slugs and a Workspace address, nothing about values or people.
- **Hosted and self-hosted alike:** nothing leaves the Installation; the template list is in the repository.

### A Pack names its templates

- **The manifest** gains an optional `feeds` list: `{ "template": "google-sheets", "fills": ["headcount", "attrition"] }`, where `template` is an id from `automation-templates/feeds/index.json` and `fills` are keys of the Pack's own Metric Catalog entries (references stay inside the Pack, spec 0030). A template id not on the list, a key not in the Pack, or more than 10 items is refused by the Pack's check, with the same code in `npx @ziffr/pack check`. A Pack that uses `feeds` says so in its `ziffr` minimum version: an older Ziffr refuses a field it does not know.
- **Installing** makes nothing of it. **Set up from this Pack** shows, after the Metrics are made, "Fill these automatically" with a button per template, for the Metrics of `fills` that were made.
- **Why only ids from Ziffr's own list:** a Pack is data from outside; it may point at a template Ziffr ships and reviews, never carry or link to a flow of its own.

### The prompt for an assistant

- **Where:** on a Metric, **Fill past periods with my assistant**: Ziffr writes a text from the Metric's name, description, unit, period and slug and the address of the MCP Server, and the person copies it. It says what to read, to send values with `submit_value` for periods with none, and to stop and ask when a number looks off.
- **What it is not:** never run by Ziffr, never a schedule, never a way to give an assistant a key: the assistant uses the key its owner already gave it. A value sent so is the assistant's person's own, marked as sent through the MCP Server like any other.
- **Words that come from the Workspace are data:** the Metric's name and description go into the text inside quotation marks and are escaped, so a description that reads like an order cannot end the quotation; the text says they are data.

## Testing Decisions

- **The templates:** every template in `index.json` parses, has only placeholders and known node types, and its shaping node's output is accepted by the Feed endpoint of a test Installation, for a month, a quarter and a year Metric (`automation-templates.test.ts`).
- **The download** (`automation-template.db.test.ts`): only Owners and Admins; only a live Feed of the Workspace; only Metrics the person sees; a slug that is not a slug, a Metric of another Workspace and a Feed of another Workspace are refused; the file holds no key by default, and with the key a Feed Key that can write only to these Metrics and ends within a year; the audit event holds no file; the demo refuses.
- **The Pack field:** the hostile table of spec 0030 gains an unknown template id, a key outside the Pack, 11 items and a duplicate; `@ziffr/pack check` and the server agree.
- **The prompt:** a table of Metric names and descriptions that try to close the quotation or give orders; the text holds them inside the quotation, escaped.
- **Tried in n8n once:** CI does not run n8n, so each template is imported into a real n8n and run against a test Installation by hand before its pull request merges, and the pull request says so.

## Tickets

1. The format, `index.json`, the checks and a guide (`docs/guides/automation-templates.md`), the glossary entry. Blocked by nothing.
2. **Google Sheets template.** Blocked by 1.
3. **Stripe template.** Blocked by 1.
4. **HubSpot template.** Blocked by 1.
5. **Get this flow from Ziffr**: `automationTemplateFor`, the screens on **Who submits** and the Set up result, the key choices, the audit event. Blocked by 1 and 2.
6. **`feeds` in the Pack format**, the check, **Set up**'s result, the guide for creators. Blocked by 5.
7. **The prompt for an assistant.** Blocked by nothing.
8. Docs, the threat model (a downloaded file that may hold a key), release notes and an independent security review of the whole spec (Opus).

## Out of Scope

- Ziffr pushing a flow into someone's n8n through its API (it needs an n8n key from the person; later, if wanted).
- Templates for Zapier, Make or Power Automate (n8n first, as spec 0034).
- A generic runner that reads a declarative description of a source (the SQL Feed, `@ziffr/feed-sql`, is that for databases already).
- Selling templates, or listing others' templates in the Marketplace beyond "works with Ziffr" (spec 0030).
- Anything that makes Ziffr run the flow, store the other system's credentials or call the other system.

## Decisions (proposed 2026-11-22)

1. **n8n templates are the main way, assistants are the side way.** A template is deterministic and scheduled; an assistant is neither, and its numbers are not verified (spec 0022).
2. **The key is not in the file unless asked.** A file travels: it gets emailed, committed and pasted into chats.
3. **Only Ziffr's own list of templates can be named by a Pack.** Everything that ends up in someone's n8n was reviewed here.
4. **Three templates to start**, chosen for how many teams already hold the numbers there: a sheet, billing, a CRM.
5. **No new glossary term**: Automation Template covers both directions.

## Further Notes

- The Feeds guide's [`n8n-feed-workflow.json`](../guides/n8n-feed-workflow.json) is the plain starting point; it stays, and the new templates are built from it.
- The success measure is the time from **Set up** to the first value that nobody typed, for a Pack with a template; the Marketplace's start Packs (spec 0030) should each name one.
