# Workspaces with roles, sign-in through Supabase Auth, and Contacts who never log in

Ziffr is multi-tenant from the start: every row belongs to a Workspace, a person can belong to several, and self-hosted and hosted Ziffr run the same code. People sign in with an email magic link, Google, Microsoft, GitHub or LinkedIn through Supabase Auth; SAML single sign-on and enforced two-factor authentication are paid features in `ee/`. Inside a workspace a person has one Workspace Role (Owner, Admin, Member, Guest), and new metrics, dashboards and decks stay private to their creator until shared, with a built-in group "Everyone in the workspace" for one-click sharing. People who only submit values do not need a login: they are Contacts known by their Slack handle, email address or form link, which keeps "capture from anywhere" working. Programs use Access Keys (scoped, bound to one workspace, ending on a date, revocable by owners); MCP clients sign in as the person through OAuth. The prototype's "view as" switch and reset button survive only in Demo Mode, which refuses to run where real accounts exist. (Superseded by ADR 0005: the demo is a workspace beside real ones.)

## Considered Options

- **One workspace per installation** for self-hosting: rejected; two code paths double the places where visibility can go wrong, and an accountant or consultant needs several workspaces anyway.
- **Every submitter needs an account**: rejected; it would break capture by Slack, email and form for the people who submit most.
- **Shared by default inside the workspace**: rejected; business numbers are often sensitive, and private-by-default matches the existing sharing model.

## Consequences

- Every table gets a workspace id, and every core function checks it before anything else; a request can never reach another workspace's rows.
- When someone leaves, an owner or admin picks who takes over what they own; their access keys and stand-in roles end; nothing is deleted and the handover shows in the version history.
- Domain joining (anyone with a verified company domain can ask to join, an owner or admin approves) exists but is off by default.
