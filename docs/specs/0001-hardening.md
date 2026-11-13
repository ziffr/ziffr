# 0001 Hardening: workspaces, sign-in and one core

**Status:** in progress. **Tracking issue:** #1 (label `tracking`); tickets carry the label `spec:0001`.

## Why

The prototype answers whether people want Ziffr. To publish it (ADR 0002) and to add a REST API and an MCP server, it has to be safe to run for strangers and to call from programs. Today identity is a cookie that falls back to one demo person, permission checks are spread over thirteen server-action files, there are no tests, and nothing separates one team's data from another's.

## What done looks like

1. People sign in (email magic link, Google, Microsoft, GitHub, LinkedIn) and work in one or more Workspaces with a Workspace Role (ADR 0003).
2. Every row belongs to a Workspace; no request can reach another workspace's rows.
3. Every read that depends on who is asking, and every change, goes through one core package that takes the acting person and checks permissions. The UI calls only the core; the API and MCP will too.
4. Submitters without a login (Contacts) still submit by Slack, email and form.
5. Access Keys exist (scoped, one workspace, end date, revocable) so the API and MCP specs can build on them.
6. The prototype's "view as" switch and reset button run only in Demo Mode, which refuses to start where real accounts exist.
7. Typecheck, lint, unit tests and the documentation checks run on every pull request, and the pure rules have tests.

## Out of scope

The REST API, the MCP server, real (non-simulated) Connectors, a scheduler for Workflows, SAML and enforced two-factor (`ee/`), and the public repository. Each gets its own spec.

## How it is built

- **Monorepo** with pnpm workspaces: `apps/web` (the current app, moved first without changes), `packages/core` (domain logic and permissions, no Next.js imports), later `packages/connector-sdk` and `apps/mcp`.
- **Actor first:** every core function takes an `Actor` (person, workspace, role, or an Access Key acting for a person) as its first argument and checks the workspace before anything else.
- **Pure rules** (comparisons, formulas, placeholders, templates, workflow rules, tokens, themes) move into `packages/core` with unit tests, unchanged in behaviour.
- **Database access** stays server-side with the service role, only inside `packages/core`; Row Level Security stays on with no policies, so nothing else can read the tables.
- **Moving step by step:** one area of the app at a time moves behind the core; the app keeps working after every ticket.

## Tickets

Each ticket is one pull request and a sub-issue of #1; "after" names the tickets it needs first. The issue number is in brackets.

1. (#2) **Monorepo skeleton and CI.** Move the app to `apps/web` unchanged; add `packages/core` with Vitest; CI runs typecheck, lint and tests on pull requests.
2. (#3) **Pure rules into the core, with tests.** After 1.
3. (#4) **Documentation checks.** Doc-comment and header rules for `packages/*`, Vale with a Ziffr style, a docs-touched check on pull requests. After 1.
4. (#5) **Workspaces and memberships in the database.** Workspaces, memberships with roles, a workspace id on every table, the demo data in one demo workspace. After 1.
5. (#6) **Actor and permission layer in the core.** The `Actor` type; visibility and permission rules from `guards` and `access` move into the core, workspace checked first. After 2, 4.
6. (#7) **Sign-in.** Supabase Auth with magic link, Google, Microsoft, GitHub, LinkedIn; the session becomes the Actor; the viewer cookie goes. After 5.
7. (#8) **Demo Mode.** `ZIFFR_DEMO=1` keeps "view as" and reset; refuses to start where real accounts exist. After 6.
8. (#9) **Workspace switcher and the "Everyone" group.** After 6.
9. (#10) **Contacts.** Submitters without a login; Tokens point to members or contacts; intake knows both. After 5.
10. (#11) **Submitting values through the core.** Intake, the web form and Connector replies call the core. After 9.
11. (#12) **Metrics and sharing through the core.** After 5.
12. (#13) **Dashboards and widgets through the core.** After 11.
13. (#14) **Decks, themes and templates through the core.** After 11.
14. (#15) **Questions, tasks, deliveries and workflows through the core.** After 10, 11.
15. (#16) **Invitations, domain joining and roles on the Team page.** After 6.
16. (#17) **Handover when someone leaves.** After 15, 12, 13, 14.
17. (#18) **Access Keys.** Create, scope, expire and revoke; owners see all in their workspace. After 5.
18. (#19) **Security pass.** Threat model in `docs/`, dependency audit and secret scanning in CI, a test for every forbidden path. After 16, 17.
