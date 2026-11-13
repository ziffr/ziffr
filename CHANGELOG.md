# Changelog

What changes for people who use or run Ziffr. Newest first; one line per change, written with the change.

## Unreleased

- Self-hosters: every table now belongs to a Workspace, and people get a Workspace Role through memberships. Existing data moves into one workspace. Until sign-in arrives, new rows land in the demo workspace.
- Developers: the app lives in `apps/web`, shared domain rules in `packages/core`; `pnpm typecheck`, `pnpm lint` and `pnpm test` run across all of them, and CI runs them on every pull request.
- Developers: the core's exports and modules must be documented, prose in the docs is checked by Vale, and pull requests that change the public surface must change docs, glossary or this changelog too.
