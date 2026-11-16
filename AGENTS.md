# Working on Ziffr (for coding agents)

Ziffr is a metric tracker: anyone, one person, a team or a business, defines the numbers they care about, Ziffr asks people for the values or people and systems send them in, and everyone sees, shares and discusses them over time. It has Metrics from any source, dashboards, stories, decks, comparisons, Workflows and Connectors. Read `GLOSSARY.md` before naming anything; `CONTRIBUTING.md` and `docs/guides/documentation.md` are the standards, this file is the short version.

## Commands

- `pnpm prototype`: local Supabase and the app on http://localhost:3000; `pnpm prototype:reset` re-seeds the demo data. `pnpm prototype:fast` builds and runs the production app instead: slower to start, as fast as production to use (dev mode compiles each page on first visit).
- `pnpm exec tsc --noEmit` and `pnpm lint`: must pass before you finish.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`: run across all packages, as CI does.
- `pnpm --filter @ziffr/core test:db`: the core's operations against the local database (needs `supabase start`); CI runs it too.
- `pnpm ci:local`: everything CI runs, on this machine. GitHub Actions minutes are counted: run it before pushing, push a branch when it is ready rather than every fix-up, and don't re-run CI to see if a flaky step passes.

## Rules

1. **Words:** use `GLOSSARY.md` terms in code, UI text and docs, never its _Avoid_ words. New or changed concept: update the glossary in the same change.
2. **One core:** reading data that depends on who is asking, and every change to data, go through `packages/core` functions that take the acting person (an `Actor`) first and check the Workspace and permissions. UI, API and MCP never query the database directly; server actions only call the core. New operations get a test against the database (`*.db.test.ts`).
3. **Visibility is the product:** whatever you return must be something the person may see (Shares, Groups, Tokens, Stand-ins, View Links). Anything sent to a browser, a Connector or a View Link carries only what is needed. Say so in a comment where it matters.
4. **Data from browsers, Connectors and links is untrusted:** validate shapes, sizes and ids on the server; never build query filters from strings.
5. **Migrations are add-only.** New file, never edit one that exists.
6. **Never read or write `.env*`** (except `.env.example`), never commit secrets; push only when the person asks for it.
7. **Documentation:** module header comment naming the glossary term; a one-line doc comment on every export; comments say why. Generated reference is never edited by hand. Details: `docs/guides/documentation.md`.
8. **ADR** only for decisions that are hard to reverse, surprising and a real trade-off (`docs/adr/`).
9. **Paid features**, once there are any, go in `ee/` under a license of their own and only add; the rest must work without them.
10. **Specs and tickets:** work from a ticket (a GitHub issue); bigger work has a spec in `docs/specs/` (see its README). Each pull request closes its ticket with `Closes #…`.
11. **Finish:** typecheck and lint pass, the change is tried in the running app when it touches UI, the user guide chapter that describes a changed screen is updated (`docs/user-guide`, checked in CI), the commit message says why, and anything people notice has a release note in `.changeset/` (format in `.changeset/README.md`; write the file, `pnpm changeset` is interactive).
12. **Releases** are made by a person with `pnpm release` (ADR 0004); never edit a released section of `CHANGELOG.md` or a version number by hand.

## Where things are

`packages/core` the core: operations (Actor first), loaders, pure rules, Connectors · `apps/web/src/app` pages and server actions · `apps/web/src/lib` the current person and workspace, sign-in, thin wrappers over the core · `apps/web/src/views` widget and story views · `apps/web/src/components` UI · `apps/web/src/decks`, `apps/web/src/canvas` slides and free layouts · `apps/web/src/sources` intake · `supabase/migrations` schema and demo seed functions. More apps and packages (MCP server, connector kit) follow; see `docs/specs/0001-hardening.md`.
