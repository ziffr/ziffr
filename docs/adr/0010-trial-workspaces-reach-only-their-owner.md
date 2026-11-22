# Trial Workspaces reach only their Owner

An Installation may offer Trial Workspaces (spec 0021): anyone signs in with their email address and makes one, and every Connector in it works for real. A public Installation lets strangers make workspaces, so its Connectors must never become a way to message people who did not ask for it. The line is that a Trial Workspace reaches only its Owner: email to the address they proved by signing in, Slack and Telegram to the accounts they linked themselves. Nobody can be invited to a Trial Workspace or join it, and Deliveries to anyone else, Contacts included, stay in the Outbox as they do in the demo. On an Installation that offers trials, every workspace is a Trial Workspace, so no rule depends on something a person chose. This amends ADR 0005, which postponed "a private demo copy per signed-in person". (Superseded by ADR 0015: trials exist only on hosted Ziffr and may have a team.)

## Considered Options

- **Consent per address**: a trial may add a colleague, who is first asked by email whether they want Prompts. Rejected: that first email is itself a message to an address someone typed, which is the abuse this rule prevents.
- **Invitations with tight limits**, as ordinary workspaces have (50 a day per workspace, 3 per address): rejected for trials. The limits are fine for a company that runs its own Installation and answers for its people. On a public one, a thousand trials each sending 50 would still be spam from the operator's domain.
- **Trials next to ordinary workspaces on one Installation**: not now. Every check would have to tell the two apart, and a mistake would open a real workspace's rules to strangers or close a company's invitations. An operator who wants both runs two Installations.
- **A copy of the demo company per visitor**: rejected for the seed. The demo's data is written for one fixed workspace id, and copying it would need every table remapped, which breaks when a table is added. Trials get sample data made through the core instead.

## Consequences

- A trial shows Ziffr to one person, not to a team. Showing it to a team takes a real Installation.
- The delivery queue has one more check next to the demo's, and every Connector inherits it, including Connectors added later.
- Operators of a public Installation still need the sign-in check against bots and the per-trial limits of spec 0021: the rule decides who can be reached, the limits decide how much.
