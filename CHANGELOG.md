# Changelog

What changes for people who use or run Ziffr. Newest first; one line per change, written with the change.

## Unreleased

- People now sign in with an email link (or Google, Microsoft, GitHub or LinkedIn once set up via `ZIFFR_AUTH_PROVIDERS`), create a workspace on first sign-in and see only their own workspaces' data. "View as", reset and the tour stay in Demo Mode (`pnpm demo`); `pnpm prototype` still starts the demo.
- Workspace admins can now change themes, groups and team settings, like owners.
- Developers: who sees what is decided in `@ziffr/core/visibility`, which ignores data from any other workspace; the app loads only the current workspace's data.
- Self-hosters: every table now belongs to a Workspace, and people get a Workspace Role through memberships. Existing data moves into one workspace. Until sign-in arrives, new rows land in the demo workspace.
- Developers: the app lives in `apps/web`, shared domain rules in `packages/core`; `pnpm typecheck`, `pnpm lint` and `pnpm test` run across all of them, and CI runs them on every pull request.
- Developers: the core's exports and modules must be documented, prose in the docs is checked by Vale, and pull requests that change the public surface must change docs, glossary or this changelog too.
