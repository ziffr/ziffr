# Changelog

What changes for people who use or run Ziffr. Newest first; one line per change, written with the change.

## Unreleased

- Developers: the app lives in `apps/web`, shared domain rules in `packages/core`; `pnpm typecheck`, `pnpm lint` and `pnpm test` run across all of them, and CI runs them on every pull request.
- Developers: the core's exports and modules must be documented, prose in the docs is checked by Vale, and pull requests that change the public surface must change docs, glossary or this changelog too.
