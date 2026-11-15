# Feeds run outside Ziffr and are Submitters of their own

Values from other systems, such as a CRM or a data warehouse, arrive through Feeds (spec 0012). A Feed belongs to the Workspace, not to a person: it is a Submitter of its own, stored as a person row like a Contact, and it keeps working when the person who created it leaves. Only Owners and Admins create Feeds and their Feed Keys. A Feed Key can only record values for the Feed's own metrics and never read their values. Ziffr never runs a Feed's code and never holds its credentials for the other system. A Feed runs wherever its operator chooses (cron, a GitHub Action, a container, an n8n flow) and pushes values through the API Source, built on the MIT `@ziffr/feed-kit`, so anyone may publish one, free, paid or closed (ADR 0002). An Import, meaning a Feed's values for past periods that had none yet, skips the Unusual Value check. Without that, connecting two years of history would raise hundreds of Approvals. The current period, any value that replaces another, and Locks are checked as for anyone.

## Considered Options

- **Feeds as keys of a person**, which is how programs submit today: rejected. Values would be credited to the wrong name, the Feed would stop when that person leaves, and the key would carry the person's read access.
- **Ziffr runs Feeds itself**, as a hosted runner with stored credentials: not now. It means running other people's code, storing secrets for every CRM and warehouse, and sandboxing it all, which is a far larger trust boundary than an endpoint that only accepts values. It can come later on top of the same Feed contract, possibly in `ee/`.
- **Metric Owners create Feeds for their own metrics**: rejected. A Feed writes into the workspace without a person, so creating one stays with the few people who already manage the workspace's Connectors and keys.
- **Imports checked like any value**: rejected. Approvals are meant for one surprising number, not for a first import of history. An Import is marked in the history instead, so a bad one can be found and corrected.

## Consequences

- The Feed contract (`GET /api/v1/feed`, the batch endpoint, `@ziffr/feed-kit`) is something other people build on. Changing it breaks their Feeds, so it is versioned like the API (ADR 0004).
- Whoever runs a Feed answers for its uptime and its credentials. Ziffr notices a broken Feed only by a missing value at the Due Date, which escalates to the metric's owner.
- A leaked Feed Key can fill empty past periods without Approval. Its reach is limited to the Feed's metrics, a daily limit and Locks, and every Import is marked and named.
- Feeds can never be Stand-ins, Approvers or receivers of Prompts, and every place that lists people must leave them out.
