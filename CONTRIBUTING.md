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

`pnpm test` runs the references on every change. `pnpm --filter @ziffr/core test:numbers` is the full-strength run. CI's `numbers` job runs it whenever a change touches a calculation path, and mutates the calculation modules the change touches, starting from the nightly run's results, in at most 20 minutes. Every night, every module is mutated, and the score must stay at least 95 %. How the tests work, what to do when one fails or a mutant survives, and how to add a case: `docs/guides/calculation-tests.md`.

## Code health

`pnpm lint` also runs `pnpm guards`: client components import only pure core modules, and the app reaches the database only through the core (tests included). CI runs the same two scripts, so they fail on your machine first.

Three checks keep the code from growing what nobody needs. `pnpm health` runs the first two, `pnpm lint` the third, and CI's `check` job and `pnpm ci:local` run both. Each fails on a new finding, never on an old one:
- **Nothing unused.** [knip](https://knip.dev) finds files, exports, types and dependencies nothing uses, and dependencies used but not listed (`knip.jsonc`). Remove what it finds. An exported server action is a way into the app even when no screen calls it, so an unused one goes. Something kept on purpose, such as the UI kit's parts, goes in `knip.jsonc` with the reason.
- **No more duplication.** [jscpd](https://github.com/kucherenko/jscpd) measures copied code in TypeScript and TSX, tests and docs left out (`.jscpd.json`). Neither format may have a higher share of copied lines than its ceiling in `scripts/code-health.mjs`. Above it, the script lists the clones: merge the new copy into a function both places call. When two pieces only look alike, say so in the pull request and leave them.
- **No more complexity.** ESLint's `complexity` and `max-lines-per-function` hold every function to the ceilings in `eslint.code-health.mjs`, today's worst. `pnpm health:worst` lists the most complex and longest functions.

A ceiling only goes down. When the worst one gets better, lower the number in the same pull request.

Once a quarter, a reminder issue (`.github/workflows/simplification.yml`) asks for a simplification pass over the whole code base: merge duplicates, shrink the most complex functions, remove dead paths. Spec 0022's verification is its safety net, as for any change: the references, mutation testing, the same number everywhere. A change that alters any number fails.

## Pull requests

- One concern per pull request; small is better.
- Fill in the template: what and why, screenshots for UI, tests, migrations, security impact, docs.
- Migrations are add-only: never edit a migration that is already merged.
- A new table with a `workspace_id` gets the demo's guard in the same migration: `select attach_demo_guard('my_table');`. The demo is read-only (#271), and `demo-read-only.db.test.ts` names any table without it.
- A new core operation that changes data is reached by the REST API, or is listed in `docs/api-coverage.md` with the reason it is not; `api-coverage.test.ts` fails otherwise (#432).
- Typecheck, lint, tests and the docs checks must pass; the CLA must be signed.
- **Every check on every pull request.** A pull request runs CI's `check` job (types, lint, unit tests, code health, secrets, prose, and the docs, guide and release-note checks), the database tests (`core-db`: the core's in three shards and the app with its API and clients, each with its own Supabase, in parallel) and the calculations at full strength (`numbers`). ziffr/ziffr is a personal repository, which GitHub gives no merge queue, so the pull request is the only gate; all three run again on every push to `main`, whose run the release asks for. Merge with `gh pr merge --auto` (agents too): it lands when all three pass. Run `pnpm ci:local` before pushing.
- **An optional pre-push hook** runs the fast checks before your push, so a pull request is red on your machine before it is red in CI: the type check of each package you changed, ESLint on the files you changed, the two client and database guards, and the user guide and release-note checks (`lefthook.yml`, `scripts/pre-push.mjs`). Opt in once with `pnpm hooks:install` after `pnpm install`; `pnpm hooks:uninstall` removes it, `git push --no-verify` skips it once. Nothing installs it automatically, and `pnpm ci:local` stays the full version.
- Commit messages: an imperative subject of at most 72 characters, then a body that says why. Agent-written commits keep their `Co-Authored-By` line.
- Anything people who use or run Ziffr will notice gets a release note: `pnpm changeset`, or a file in `.changeset/` as its README shows. Say in one or two plain sentences what changes for them; start notes for self-hosters with "Self-hosters:" and for developers with "Developers:". CI asks for it.

## Reviewing pull requests (maintainers)

- **Read agent and CI files before you run anything.** A pull request can change `.claude/` (hooks are shell scripts Claude Code runs on your machine), `CLAUDE.md`, `AGENTS.md`, `.github/` or `scripts/`. Before you start a coding agent or run scripts on someone else's branch, read the diff of those paths yourself. CODEOWNERS asks for your review of them for the same reason.
- **Approve workflow runs from forks only after a look at the diff.** Checks of a first-time contributor's pull request wait for "Approve and run".

## Versions and releases

Ziffr has one version for the product (app, core and database together), `0.x` until the first public release (ADR 0004). A release is a tag on `main` (ADR 0014). The owner presses one button: **Actions → Release → Run workflow** on `main`, or `pnpm release`, which starts the same run (`.github/workflows/release.yml`). In about ten minutes the run:

1. Refuses unless `main`'s CI passed on its newest commit. `main` takes nothing without its required checks, so nothing else runs again; the full mutation run stays nightly.
2. Takes the release notes added to `.changeset/` since the previous tag `vX.Y.Z` and the version their bump levels make, and refuses when there are none. `node scripts/next-release.mjs` shows the same beforehand, on any computer.
3. Tags that commit `vX.Y.Z`. Nothing is committed: the version comes from the tag.
4. Builds the image with that version, starts it once with `docker/compose.yml` and checks it from outside, then pushes `X.Y.Z`, `X.Y` and `latest`.
5. Makes the GitHub release, marked Latest, from the notes (self-hoster notes first, and the day the version becomes AGPL-3.0), with the version's `compose.yml` and `install.sh` attached.
6. Refreshes the Preview, then publishes the npm packages at that version.

If a job fails after the tag, use **Re-run failed jobs**; a `v*` or `*-v*` tag cannot be moved or deleted. A fix to the code is a pull request and a new press. Release notes stay in `.changeset/` after a release, since only files added after the previous tag count; a normal pull request may delete old ones. `CHANGELOG.md` keeps the versions up to 0.11.0; newer ones are on the [Releases page](https://github.com/ziffr/ziffr/releases). No release changes a file on `main`: the release writes its version into what it builds and attaches. The product's `package.json` files stay at 0.11.0, the last version committed, and the core uses that only where no image says otherwise (`packages/core/src/ziffr-version.ts`: Packs are checked against `ZIFFR_VERSION` in a release's image); the MIT packages say `0.0.0-dev`, and the Docker files on `main` name a placeholder.

Between releases, the pre-release **Preview** on the releases page shows what `main` holds beyond the last release: the notes added since and every commit since, replaced after every push to `main` and after every release (`.github/workflows/preview.yml`). After every push to `main` the image `ghcr.io/ziffr/ziffr:main` is built too (`.github/workflows/next-image.yml`), and the **next** Ziffr at https://app.ziffr.net follows it, so a merged change can be tried on a real server without a release.

### The MIT packages

`@ziffr/sdk`, `@ziffr/mcp`, `@ziffr/feed-kit` and `@ziffr/feed-sql` carry the product's version from 0.12.0 on and are published to npm with every release (ADR 0014). The Release workflow writes the version into each package without committing it, packs them in a job with no way to publish, and publishes them with npm provenance in the environment `release`, each before the packages that depend on it. Nothing else publishes them. main's CI tested each against the running app on that commit already.

Publishing needs no token: each package has trusted publishing set up on npmjs.com (repository `ziffr/ziffr`, workflow `release.yml`, environment `release`; the environment deploys only from `main`). A new package is published once by hand or with a short-lived token, then gets the same setup.

## Running it

See the README. Never commit `.env.local` or any secret; ask in the issue if you need a key.
