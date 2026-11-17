# The demo is a workspace beside real ones, open without an account

Ziffr offers a demo next to the real workspaces of the same installation: "Try the demo" on the login page opens the made-up company Northwind Goods without an account. A visit is marked by a cookie and reaches only the demo workspace and its made-up people: "view as" switches only between them, actions write only there, and the reset empties only that workspace and seeds it again; real workspaces, real people and their accounts are never touched. Signing in, or opening one's own workspace, ends the visit. The demo is on by default and an installation switches it off with `ZIFFR_DEMO=0`. This replaces the rule in ADR 0003 that Demo Mode refuses to run where real accounts exist.

## Considered Options

- **Demo only on an empty database** (ADR 0003): rejected; people evaluating Ziffr should be able to try it on the real installation, and a separate installation for the demo is one more thing to run.
- **A private demo copy per signed-in person**: not now; it needs an account first, which is exactly what a visitor does not have yet. Since taken up as Trial Workspaces (ADR 0010, spec 0021).

## Consequences

- The demo's reset and seed work on one workspace and take every id from the database, because real rows share the same tables and sequences.
- Everything a demo visit reaches goes through the same workspace checks as real work; a demo visitor is a demo person in the demo workspace, nothing more.
- Visitors share one demo: what one changes, the next sees until someone resets it.
- The demo's people can never sign in, and nobody can claim them by email.
