# Working on Ziffr (for coding agents)

Ziffr is a workspace where a small team keeps its business numbers: Metrics from any source, dashboards, stories, decks, comparisons, Workflows and Connectors. Read `GLOSSARY.md` before naming anything; `CONTRIBUTING.md` and `docs/guides/documentation.md` are the standards, this file is the short version.

## Commands

- `pnpm prototype`: local Supabase and the app on http://localhost:3000; `pnpm prototype:reset` re-seeds the demo data.
- `pnpm exec tsc --noEmit` and `pnpm lint`: must pass before you finish.
- Tests: none yet in the prototype; new pure modules get unit tests from now on.

## Rules

1. **Words:** use `GLOSSARY.md` terms in code, UI text and docs, never its _Avoid_ words. New or changed concept: update the glossary in the same change.
2. **One core:** reading data that depends on who is asking, and every change to data, go through core functions that take the acting person and check permissions. UI, API and MCP never query the database directly. In the prototype the checks live in `src/lib/guards.ts` and `src/lib/access.ts`; use them, don't write new ones inline.
3. **Visibility is the product:** whatever you return must be something the person may see (Shares, Groups, Tokens, Stand-ins, View Links). Anything sent to a browser, a Connector or a View Link carries only what is needed. Say so in a comment where it matters.
4. **Data from browsers, Connectors and links is untrusted:** validate shapes, sizes and ids on the server; never build query filters from strings.
5. **Migrations are add-only.** New file, never edit one that exists.
6. **Never read or write `.env*`** (except `.env.example`), never commit secrets; push only when the person asks for it.
7. **Documentation:** module header comment naming the glossary term; a one-line doc comment on every export; comments say why. Generated reference is never edited by hand. Details: `docs/guides/documentation.md`.
8. **ADR** only for decisions that are hard to reverse, surprising and a real trade-off (`docs/adr/`).
9. **Paid features** go in `ee/` and only add; the rest must work without them.
10. **Specs and tickets:** work from a ticket (a GitHub issue); bigger work has a spec in `docs/specs/` (see its README). Each pull request closes its ticket with `Closes #…`.
11. **Finish:** typecheck and lint pass, the change is tried in the running app when it touches UI, and the commit message says why.

## Where things are (prototype layout)

`src/app` pages and server actions · `src/lib` domain logic, access and guards · `src/views` widget and story views · `src/components` UI · `src/connectors` Connectors · `src/decks`, `src/canvas` slides and free layouts · `src/sources` intake · `supabase/migrations` schema and demo seed functions. The target layout (monorepo with `packages/core`, `apps/web`, `apps/mcp`, connector kit) is described in `CONTRIBUTING.md`.
