# Contributing to Ziffr

Thank you for helping. This page says how we work; `CLAUDE.md` says the same for coding agents, and both point to the same standards.

## Where to start

- **Try it first:** the demo ("Try the demo" on the login page) shows every part of Ziffr with made-up data. The README says how to run it locally.
- **Pick an issue:** issues labelled [`good first issue`](https://github.com/ziffr/ziffr/labels/good%20first%20issue) are small and self-contained, and say how to check they are done. Comment on one before you start, so two people don't do the same work.
- **Ask:** questions and half-formed ideas go to [Discussions](https://github.com/ziffr/ziffr/discussions); bugs and concrete proposals go to issues.

## Before you start

- **License:** Ziffr is source-available under the BSL 1.1, with MIT for the connector kit and client libraries (`docs/adr/0002-source-available-license.md`). On your first pull request, CLA Assistant asks you to accept the [CLA](CLA.md) with one click.
- **Bigger changes:** open an issue first. A new concept or a change to an existing one starts with the words: see "Domain language" below.

## Domain language

`GLOSSARY.md` is the vocabulary of Ziffr: a Metric, an Observation, a Prompt, a Delivery, a Workflow. Code, UI text, docs, issues and pull requests use these words and never the ones listed under _Avoid_. A new concept, or a sharper meaning for an existing one, updates the glossary in the same pull request. The glossary holds definitions only, no implementation.

## How the code is organised

- **One core:** every change to data, and every read that depends on who is asking, goes through a function in the core that takes the acting person and checks permissions itself. The UI (server actions), the REST API and the MCP server are thin layers that call those functions; they never query the database on their own.
- **Pure where possible:** rules that need no database (comparisons, formulas, placeholders, templates, workflow rules) live in pure modules with unit tests.
- **Connectors** implement the Connector interface from the connector kit and never reach into the core's internals.
- **Paid features**, once there are any, live in `ee/` under a license of their own and only add to what works without them.

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

## Calculations

Every calculation on values is listed in the Calculation Catalogue (`docs/reference/calculations.md`) with its rule, its code, its reference and its tests, and is held to an independent reference in `packages/core/src/test/reference/` for every combination of its inputs, on hand-made and generated cases (spec 0022). A new calculation needs four things, or a test fails:
- its module in `packages/core/calculation-modules.json`, so coverage holds it to 100 % and Stryker mutates it;
- a row in the catalogue for every function it exports;
- a reference and tests against it;
- its paths in `.github/calculation-paths.txt`.

`pnpm test` runs the references on every change. `pnpm --filter @ziffr/core test:numbers` is the full-strength run. CI's `numbers` job runs it whenever a change touches a calculation path. Every night and before a release, every module is mutated, and the score must stay at least 95 %. How the tests work, what to do when one fails or a mutant survives, and how to add a case: `docs/guides/calculation-tests.md`.

## Pull requests

- One concern per pull request; small is better.
- Fill in the template: what and why, screenshots for UI, tests, migrations, security impact, docs.
- Migrations are add-only: never edit a migration that is already merged.
- Typecheck, lint, tests and the docs checks must pass; the CLA must be signed.
- Commit messages: an imperative subject of at most 72 characters, then a body that says why. Agent-written commits keep their `Co-Authored-By` line.
- Anything people who use or run Ziffr will notice gets a release note: `pnpm changeset`, or a file in `.changeset/` as its README shows. Say in one or two plain sentences what changes for them; start notes for self-hosters with "Self-hosters:" and for developers with "Developers:". CI asks for it.

## Reviewing pull requests (maintainers)

- **Read agent and CI files before you run anything.** A pull request can change `.claude/` (hooks are shell scripts Claude Code runs on your machine), `CLAUDE.md`, `AGENTS.md`, `.github/` or `scripts/`. Before you start a coding agent or run scripts on someone else's branch, read the diff of those paths yourself. CODEOWNERS asks for your review of them for the same reason.
- **Approve workflow runs from forks only after a look at the diff.** Checks of a first-time contributor's pull request wait for "Approve and run".

## Versions and releases

Ziffr has one version for the product (app, core and database together), `0.x` until the first public release (ADR 0004). A maintainer releases with `pnpm release`: it turns the waiting notes into a `CHANGELOG.md` section, sets the version and commits it on a branch `release/vX.Y.Z`. `main` takes changes only by pull request with passing checks, for everyone, so the release goes in as a pull request too. Once it is merged, `pnpm release:tag` tags the merged commit `vX.Y.Z`. Pushing the tag (`git push origin vX.Y.Z`) creates the GitHub release from that same section, including the day the version becomes AGPL-3.0, once a maintainer approves the run: release jobs wait in the GitHub environment `release`. Only maintainers may create `v*` and `*-v*` tags. Between releases, the pre-release **Preview** on the releases page shows what `main` holds beyond the last release: the waiting notes and every commit since, replaced after every push to `main` (`.github/workflows/preview.yml`).

### The MIT packages

`@ziffr/sdk`, `@ziffr/mcp`, `@ziffr/feed-kit` and `@ziffr/feed-sql` have versions of their own and are published to npm, each on its own (ADR 0004). A maintainer:

1. Sets the package's `version` in its `packages/<name>/package.json` in a pull request, and merges it.
2. Tags that commit `<name>-vX.Y.Z` (such as `sdk-v0.2.0` or `feed-kit-v0.1.0`) and pushes the tag. The "Publish a package" workflow checks the tag against the version, checks that the `@ziffr` packages it depends on are published (the MCP server and the feed kit need their SDK version, the SQL Feed its feed kit), runs every check and the package's tests against the running app, and publishes with npm provenance.

Publishing needs no token: each package has trusted publishing set up on npmjs.com (repository `ziffr/ziffr`, workflow `publish-packages.yml`, environment `release`). A new package is published once by hand or with a short-lived token, then gets the same setup.

## Running it

See the README. Never commit `.env.local` or any secret; ask in the issue if you need a key.
