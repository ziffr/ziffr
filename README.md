# Ziffr

One home for a small team's business numbers. Metrics from any source, values captured where people already work (a form link, email, an API, an AI assistant), dashboards, decks and comparisons, and Workflows that ask for each number, remind, check unusual values and lock a period when it is done. Everyone sees what was shared with them, nothing more.

Ziffr is in its `0.x` releases: used and tested, not yet at a first public release. See [CHANGELOG.md](CHANGELOG.md) for what each version brought.

## What it does

- **Metrics and values.** Define Metrics from scratch or from the Metric Catalog, with targets, Polarity and a Submission Rule. Values come in through each Submitter's personal form link, by email replies, through the [API](docs/guides/api.md), from another system such as a CRM or a data warehouse through a [Feed](docs/guides/feeds.md), or from an AI assistant through the [MCP server](packages/mcp/README.md). Contacts without an account submit too.
- **Workflows.** Ask Submitters when a period closes, remind before the Due Date, escalate after it, have Unusual Values approved, and lock the period. They run on their own each morning in the workspace's time zone ([scheduled jobs](docs/guides/jobs.md)).
- **Asking without leaving.** Questions and tasks on a value, answered in a Thread or by replying to the email, with Corrections the Metric owner accepts.
- **Seeing the numbers.** Drag-and-drop dashboards of Widgets and Findings, read as a grid or top to bottom, an Analysis Canvas (forecast, correlation, drivers), comparisons against earlier periods and targets, and decks exported to PowerPoint or PDF.
- **Teams.** Workspaces with Owners, Admins, Members and Guests; sharing with people and Groups; invitations by email or link; handover when someone leaves; View Links for people outside.
- **For programs.** A versioned REST API with Access Keys, limits and an Access Log, a TypeScript SDK and a local MCP server.

## Try it

**The demo.** "Try the demo" on the login page opens a made-up 15-person online shop, without an account. Its data is generated relative to today, so last month's cost spike stays last month. Switch between its people with "View as" and reset it with ↺ in the header. The guided tour (bottom right) walks through defining a Metric, capturing a value, building a dashboard, asking a question, analysing, and making a deck.

**Locally.** Needs Docker and pnpm.

```sh
pnpm install
cp .env.example .env.local   # then fill in SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env`
pnpm prototype               # local Supabase (ports 554xx) and the app on http://localhost:3000
pnpm prototype:reset         # wipe the local database and re-seed the demo
pnpm prototype:stop          # stop local Supabase
```

Local Supabase also runs Mailpit at http://127.0.0.1:55424, where every email Ziffr sends lands when `ZIFFR_SMTP_URL=smtp://127.0.0.1:55425`.

**On your own servers.** [Running Ziffr yourself](docs/guides/self-hosting.md) goes from an empty Supabase project to a team using it, with a checklist for production.

## Not there yet

- WhatsApp and ticket systems are simulated Connectors: the Connectors and Sources pages let you play the other side. Email and Slack are real.
- Analyses, Views and Sources are built in; the seams for plugging in others are marked in `apps/web/src/analyses`, `views` and `sources`.
- Clustering and impact analysis are shown as "coming soon".
- The slide editor uses tldraw, which needs a licence from tldraw for production use.
- `@ziffr/sdk`, `@ziffr/mcp`, `@ziffr/feed-kit` and `@ziffr/feed-sql` are ready to publish to npm but not published yet.

## Working on Ziffr

[CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) are the standards; [GLOSSARY.md](GLOSSARY.md) is the vocabulary. Bigger changes start as a spec in [docs/specs](docs/specs/README.md); hard-to-reverse decisions are in [docs/adr](docs/adr). How Ziffr is secured: [docs/security/threat-model.md](docs/security/threat-model.md).

```sh
pnpm typecheck && pnpm lint && pnpm test   # what CI runs on every pull request
pnpm --filter @ziffr/core test:db          # the core against the local database
```

## License

Ziffr is **source-available** under the [Business Source License 1.1](LICENSE): use it, change it and run it yourself, also commercially inside your organisation; offering it to others as a hosted service is reserved. Each version becomes AGPL-3.0 three years after release. The `ee/` folder is under the paid [Ziffr Business License](ee/LICENSE); the SDK, the MCP server, the feed kit and the SQL Feed are MIT, and the connector kit will be. Why: [ADR 0002](docs/adr/0002-source-available-license.md).
