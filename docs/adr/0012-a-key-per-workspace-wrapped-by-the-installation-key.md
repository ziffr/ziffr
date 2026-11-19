# A key per Workspace, wrapped by the Installation's key, in the app; not end-to-end

People asked for keys of their own, "so that you cannot read our numbers". We checked that against what Ziffr's server has to do with a Workspace's data, and decided: **each Workspace's sensitive data is encrypted in the app with a Workspace Key of its own (AES-256-GCM), stored wrapped by a key derived from the Installation's `ZIFFR_SECRETS_KEY`. Deleting a Workspace destroys its key. It is not end-to-end encryption, and Ziffr does not claim it is: for "nobody but us may read it", the answer is to run Ziffr yourself.** Spec 0028 has the details and the order of work.

## Why not keys only the people hold

End-to-end encryption means the server never sees a value in clear. Ziffr's server reads values all the time, and that is its job, not a shortcut:

- it reads answers to Prompts by email, Slack and Telegram, finds the number and the period in them, and records it;
- it checks every value for the Unusual Value check, applies the Submission Rule (adding up, rejecting a second one), and asks for Approval;
- it aggregates Metrics into longer periods, computes Derived Metrics, Comparisons, Attainment and Analyses;
- it sends reminders and Deliveries that carry values and names, and serves View Links, exports, decks, the API, the MCP Server and Feeds to people and programs who hold no key of their own.

Every one of these would have to move into a browser holding the key, or stop. A Workflow that runs at night, a View Link opened by a stranger and a Feed sending values have no browser. So keys held only by people would remove most of Ziffr. We say so plainly to whoever asks.

## What the Workspace Key does protect

- A **stolen database dump or backup**, or a disk, without the Installation's key: Workspace data in it is ciphertext.
- A **read-only SQL leak** (a query that returns rows it should not, a reporting tool pointed at the database): it returns ciphertext.
- **Deletion:** once a Workspace's key is destroyed, its data cannot be read from the live database, its replicas or any copy made afterwards. Backups taken before the deletion still open until they expire, so the promise is "unreadable in backups after the retention period", and nothing stronger. Making old backups unreadable by cryptography too (Installation key epochs) is left for when a customer needs it (spec 0028).

It does not protect against a compromised app server, a malicious operator of the Installation, or a memory dump of a running Ziffr: they hold the key while they work. Running Ziffr on your own servers is the answer for that, and it always will be (ADR 0002 keeps that possible).

## Considered Options

- **Keys held only by people (end-to-end):** rejected, for the reasons above.
- **Disk or volume encryption only:** good and recommended for every self-hoster, but it protects a stolen disk, not a dump, a backup copied elsewhere or a SQL leak, and it cannot forget one Workspace. Kept as advice in the self-hosting guide, not as the answer.
- **Encryption inside Postgres (pgcrypto with a key per session, or pgsodium and Vault):** the key then reaches the database server, often in query text or settings, where logs and `pg_stat_statements` can keep it; a SQL leak that can call the decrypting function reads clear text; Supabase advises against new use of pgsodium; and self-hosters on another Postgres would need the extension. Rejected.
- **A separate `ZIFFR_DATA_KEY` next to `ZIFFR_SECRETS_KEY`:** cleaner separation, but one more key every self-hoster must make, back up and rotate, with a new way to lose everything. Docker already makes and keeps `ZIFFR_SECRETS_KEY`, and spec 0009's way of changing it (`ZIFFR_SECRETS_KEY_PREVIOUS`) already exists. Rejected in favour of deriving the wrapping key from it with HKDF and a label of its own, so the two uses never share a key.
- **A key service: Infisical, HashiCorp Vault, a cloud KMS:** Infisical, which we run ourselves, keeps an operator's secrets (database passwords, API keys) out of files; it does not encrypt a Workspace's data, and Ziffr would still need everything in this ADR. Making it part of the stack would add one more service, with its own database and backups, for every self-hoster, against ADR 0008's lean stack. Not added. A Workspace Key is wrapped through one small interface, so a key service can do the wrapping later (below).
- **Bring your own key (a customer's KMS wraps their Workspace Key):** wanted by some businesses; it belongs in `ee/` (ADR 0002's paid folder) and is not built now. This ADR fixes only the extension point.

## Consequences

- The core gets one place that seals and opens Workspace data (`workspace-keys.ts`), and every core function that reads or writes an encrypted column goes through it. SQL can no longer compute with an encrypted column: what it does today (the "add up" Submission Rule, merging Breakdown rows by label, the demo's and trials' made-up values) moves into the core or works on a blind index. Spec 0028 measures this.
- Searching and sorting by encrypted text happen in the core after opening, which today is already the case for every list people search.
- Losing `ZIFFR_SECRETS_KEY` now loses every Workspace's data, not only Slack tokens and sealed settings. The self-hosting guide and the upgrade notes say so before the change, and Docker keeps the key in its own volume as today.
- **Extension point:** wrapping and unwrapping a Workspace Key go through a `KeyWrapper` with two functions, `wrap(workspaceId, version, key)` and `unwrap(workspaceId, version, wrapped)` (the version is bound into the wrapping, as spec 0028 says), and a name stored with each wrapped key. The open-source wrapper is the Installation's derived key; `ee/` may add others (a customer's KMS), chosen per Workspace. Nothing else in the core knows which one wrapped a key.
- Ziffr's own pages and docs never call this end-to-end encryption or say that "we cannot read your data". They say what it protects against, in the words of this ADR.
