# Contributing to Ziffr

Thank you for helping. This page says how we work; `CLAUDE.md` says the same for coding agents, and both point to the same standards.

## Before you start

- **License:** Ziffr is source-available under the BSL 1.1, with a paid business license for `ee/` and MIT for the connector kit and client libraries (`docs/adr/0002-source-available-license.md`). Your first pull request asks you to accept the [CLA](CLA.md).
- **Bigger changes:** open an issue first. A new concept or a change to an existing one starts with the words: see "Domain language" below.

## Domain language

`GLOSSARY.md` is the vocabulary of Ziffr: a Metric, an Observation, a Prompt, a Delivery, a Workflow. Code, UI text, docs, issues and pull requests use these words and never the ones listed under _Avoid_. A new concept, or a sharper meaning for an existing one, updates the glossary in the same pull request. The glossary holds definitions only, no implementation.

## How the code is organised

- **One core:** every change to data, and every read that depends on who is asking, goes through a function in the core that takes the acting person and checks permissions itself. The UI (server actions), the REST API and the MCP server are thin layers that call those functions; they never query the database on their own.
- **Pure where possible:** rules that need no database (comparisons, formulas, placeholders, templates, workflow rules) live in pure modules with unit tests.
- **Connectors** implement the Connector interface from the connector kit and never reach into the core's internals.
- **Paid features** live in `ee/` and only add to what works without them.

## Naming

| What | Convention | Example |
| --- | --- | --- |
| Domain words in code | Glossary terms | `Observation`, `Prompt`, `Delivery` |
| Files | kebab-case | `metric-workflow.tsx` |
| React components | PascalCase | `MetricWorkflow` |
| Core functions | verb + noun | `submitObservation`, `approveValue` |
| Database tables, columns | snake_case, tables plural | `view_links`, `expires_at` |
| Migrations | timestamp, verb, noun | `20261201120000_add_workspaces.sql` |
| API routes | plural nouns | `/v1/metrics/{id}/observations` |
| MCP tools | snake_case verb + noun | `submit_observation` |
| Environment variables | `ZIFFR_` prefix | `ZIFFR_SESSION_SECRET` |
| Branches | `feat/`, `fix/`, `docs/`, `chore/` | `feat/webhook-connector` |

## Documentation and comments

Read [docs/guides/documentation.md](docs/guides/documentation.md): what gets documented where, how comments are written, and what the checks enforce. Undocumented public surface does not pass review.

## Specs and tickets

Work bigger than one pull request starts with a spec in `docs/specs/` and is split into tickets: GitHub issues that are sub-issues of the spec's tracking issue. Every pull request closes a ticket (`Closes #123`), so progress shows itself. Details: [docs/specs/README.md](docs/specs/README.md).

## Pull requests

- One concern per pull request; small is better.
- Fill in the template: what and why, screenshots for UI, tests, migrations, security impact, docs.
- Migrations are add-only: never edit a migration that is already merged.
- Typecheck, lint, tests and the docs checks must pass; the CLA must be signed.
- Commit messages: an imperative subject of at most 72 characters, then a body that says why. Agent-written commits keep their `Co-Authored-By` line.
- Anything people who use or run Ziffr will notice gets a release note: `pnpm changeset`, or a file in `.changeset/` as its README shows. Say in one or two plain sentences what changes for them; start notes for self-hosters with "Self-hosters:" and for developers with "Developers:". CI asks for it.

## Versions and releases

Ziffr has one version for the product (app, core and database together), `0.x` until the first public release (ADR 0004). A maintainer releases with `pnpm release`: it turns the waiting notes into a `CHANGELOG.md` section, sets the version, commits and tags `vX.Y.Z`. Pushing the tag (`git push --follow-tags`) creates the GitHub release from that same section, including the day the version becomes AGPL-3.0.

### The MIT packages

`@ziffr/sdk`, `@ziffr/mcp`, `@ziffr/feed-kit` and `@ziffr/feed-sql` have versions of their own and are published to npm, each on its own (ADR 0004). A maintainer:

1. Sets the package's `version` in its `packages/<name>/package.json` in a pull request, and merges it.
2. Tags that commit `<name>-vX.Y.Z` (such as `sdk-v0.2.0` or `feed-kit-v0.1.0`) and pushes the tag. The "Publish a package" workflow checks the tag against the version, checks that the `@ziffr` packages it depends on are published (the MCP server and the feed kit need their SDK version, the SQL Feed its feed kit), runs every check and the package's tests against the running app, and publishes with npm provenance.

Before the first publish: create the npm organisation `ziffr` and add an npm automation token as the repository secret `NPM_TOKEN`. After the first publish of each package, set up trusted publishing for it on npmjs.com (repository `ziffr/ziffr`, workflow `publish-packages.yml`) and remove the secret.

## Running it

See the README. Never commit `.env.local` or any secret; ask in the issue if you need a key.
