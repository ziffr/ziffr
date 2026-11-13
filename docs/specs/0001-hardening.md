# 0001 Hardening: workspaces, sign-in and one core

**Status:** in progress. **Tracking issue:** #1 (labels `tracking`, `ready-for-agent`); tickets carry `spec:0001`.

## Problem Statement

Ziffr works as a prototype, and the people who tried it want it. But nobody can run it for real yet. Anyone who reaches it is "Sara", because identity is a "view as" switch. One team's numbers are not separated from another's. Whether someone may see or change something is decided in many places, and checking found gaps more than once. Nothing tests the rules. And Ziffr cannot be published or opened to programs (a REST API, an MCP server) in this state, because a program would inherit all of these weaknesses.

## Solution

People sign in with an email link, Google, Microsoft, GitHub or LinkedIn. They work in one or more Workspaces, each with its own people, numbers, dashboards, decks, themes and connectors, and a Workspace Role (Owner, Admin, Member, Guest) that says what they may do. Every row belongs to exactly one workspace and nothing crosses between them. Every read that depends on who is asking, and every change, goes through one core that checks the person and their workspace first. The web app uses only that core, and so will the API and the MCP server. People who only submit numbers keep doing so by Slack, email or form without an account, as Contacts. Programs get Access Keys. The prototype's "view as" switch survives as Demo Mode, for showing Ziffr with made-up data. Typecheck, lint, tests and documentation checks run on every change.

## User Stories

1. As a team owner, I want to sign in with my work email, so that only I can act as me.
2. As a team member, I want to sign in with Google, Microsoft, GitHub or LinkedIn, so that I do not need another password.
3. As a person, I want to sign out, so that nobody else on a shared computer acts as me.
4. As a new user without a workspace, I want to create one, so that I can start keeping my team's numbers.
5. As the creator of a workspace, I want to become its Owner, so that I can set it up and invite others.
6. As an accountant who works for several companies, I want to belong to several workspaces and switch between them, so that I keep each company's numbers apart.
7. As a person in two workspaces, I want to see only the current workspace's metrics, dashboards and threads, so that I never mix up or leak numbers.
8. As an Owner, I want to invite people by email or link with a role, so that the right people join with the right rights.
9. As an Owner, I want people from our verified company domain to ask to join, so that colleagues find their way in, while I still approve them.
10. As an Owner, I want domain joining to be off unless I switch it on, so that nobody joins by surprise.
11. As an Owner, I want to change someone's role, so that responsibilities can change.
12. As an Owner, I want several owners in one workspace, so that the workspace does not depend on one person.
13. As an Admin, I want to manage members, themes and groups, so that the Owner does not have to do everything; but I cannot remove owners or change billing.
14. As a Member, I want to create and share metrics, dashboards and decks, so that I can do my work.
15. As a Guest, I want to see what was shared with me, answer questions and submit values, so that I can take part without being a full member.
16. As an Owner, I want Guests unable to create anything, so that outside people cannot change the workspace.
17. As a field worker without an account, I want to submit numbers by Slack, email or form, so that capturing a value takes seconds.
18. As an Owner, I want to keep Contacts with their Slack handle, email or phone, so that values from them are recorded under their name.
19. As an Owner, I want to invite a Contact later, so that they can become a Member or Guest without losing their history.
20. As a Contact, I want my form link to keep working, so that I don't have to sign up to submit.
21. As a creator, I want new metrics, dashboards and decks to stay private until I share them, so that sensitive numbers are safe by default.
22. As a creator, I want to share with "Everyone in the workspace" in one click, so that open things are easy to open.
23. As an Owner removing a member, I want to pick who takes over what they owned, so that nothing is orphaned or lost.
24. As an Owner removing a member, I want their Access Keys and stand-in roles to end at once, so that a former colleague cannot act anymore.
25. As an Owner, I want the handover to show in the version history, so that anyone can see later what happened.
26. As a developer, I want to create an Access Key with chosen scopes and an end date, so that a program can read metrics or submit values for me and nothing more.
27. As a developer, I want an Access Key to act with my permissions in one workspace, so that a program never sees more than I do.
28. As an Owner, I want to see and revoke every Access Key in my workspace, so that I stay in control of programmatic access.
29. As a person demoing Ziffr, I want a Demo Mode with made-up data, a "view as" switch and a reset, so that I can show the idea to others.
30. As an Owner of a real installation, I want Demo Mode to refuse to start where real accounts exist, so that nobody can switch identities in production.
31. As a self-hoster, I want the same code as the hosted Ziffr, with one or a few workspaces, so that I get the same safety.
32. As a viewer of a dashboard, I want what I see to depend only on what was shared with me in this workspace, so that a share elsewhere never grants me anything here.
33. As an Owner, I want a request from another workspace's data to fail, so that ids guessed or copied from elsewhere reveal nothing.
34. As a submitter, I want my values, Submission Rules, Locks and Workflows to behave exactly as before, so that hardening changes nothing in my day.
35. As a contributor, I want every change checked by typecheck, lint, tests and documentation checks, so that the standards hold whoever contributes.
36. As a contributor, I want the domain rules tested in one place, so that I can change them with confidence.
37. As a maintainer, I want a threat model and dependency and secret scanning, so that we find weaknesses before publishing.
38. As a future API or MCP client, I want every operation to exist once in the core, so that I get the same checks as the web app.

## Implementation Decisions

- **Monorepo.** A web app and a core package in one workspace; the API and the MCP server will be further apps on the same core. The web app moved first, unchanged in behaviour.
- **One core.** Every operation that reads data depending on who asks, or changes data, is a core function. It takes an `Actor` first: the person, the workspace, their Workspace Role, and optionally an Access Key with its scopes. The web app's server actions, and later the API and MCP, are thin layers over these functions. Database access with the service role exists only inside the core, and Row Level Security stays on with no policies, so nothing else can read the tables.
- **Workspace first.** Every core function checks that every row it touches belongs to the actor's workspace before anything else. The visibility rules are pure functions that take the workspace and ignore rows from any other one.
- **Capabilities per role.** A small table says what each Workspace Role may do: Owners everything, Admins all but billing and removing owners, Members create and share, Guests nothing beyond what is shared with them.
- **Schema.** Workspaces; memberships linking a person, a workspace and a role; a workspace id on every table except people, the Metric Catalog and Away dates. Uniqueness that was installation-wide (metric slugs, group names, the default theme, delivery preferences) is per workspace. Until every write goes through the core, new rows default to the demo workspace; the defaults are dropped then.
- **Sign-in.** Supabase Auth: email magic link, and Google, Microsoft, GitHub and LinkedIn, each shown only once its credentials are configured. A signed-in account maps to a person; the current workspace is chosen among their memberships. SAML and enforced two-factor are paid features in the `ee/` folder (ADR 0002).
- **Contacts.** People without a login who submit values. A Token points to a member or a contact; intake recognises both. Contacts can be invited later and become members.
- **Access Keys.** Scoped, bound to one workspace, ending on a date, revocable by their creator and by owners; they act with their creator's permissions within their scopes.
- **Demo Mode.** Turned on by a setting. It keeps the demo seed, "view as" and reset, and refuses to start where real accounts exist.
- **Decisions recorded:** ADR 0002 (license), ADR 0003 (workspaces, roles, sign-in), and the glossary terms Workspace, Workspace Role, Contact, Access Key, Demo Mode.

## Testing Decisions

- **One seam:** the public functions of the core. Tests call them as the web app, the API and the MCP server will, with an Actor, and check what comes back or what was stored, never how it was done.
- **Pure rules** (comparisons, formulas, placeholders, templates, workflow rules, tokens, themes, visibility) are tested directly with small fixtures. Prior art: the core's existing unit tests and their shared fixtures.
- **Operations that touch data** are tested through the same core functions against a real local Postgres with the migrations applied, in CI as well. Every forbidden path gets a test: another workspace, another person's object, a Guest creating, an expired or out-of-scope Access Key.
- **Workspace isolation** is tested first and everywhere: facts or ids from another workspace never grant anything.
- **The UI** is not unit-tested. One browser smoke test signs in with a magic link and opens a dashboard.

## Out of Scope

The REST API, the MCP server, real (not simulated) Connectors, a scheduler for Workflows, SAML and enforced two-factor, billing, and the public repository. Each gets its own spec.

## Further Notes

- Work happens on the `next` branch, one pull request per ticket; each closes its ticket. The tickets are the sub-issues of #1:
  #2 monorepo and CI (done), #3 pure rules with tests (done), #4 documentation checks (done), #5 workspaces in the database (done), #6 actor and permission layer (done), #7 sign-in, #8 Demo Mode, #9 workspace switcher and the Everyone group, #10 Contacts, #11 submitting values through the core, #12 metrics and sharing through the core, #13 dashboards and widgets, #14 decks, themes and templates, #15 questions, tasks, deliveries and workflows, #16 invitations, domain joining and roles, #17 handover when someone leaves, #18 Access Keys, #19 security pass.
- Found during #6, to settle with #12: the rule "a derived metric is visible when all its inputs are" never applies, because owners already see their own metrics.
