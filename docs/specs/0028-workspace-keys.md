# 0028 Workspace Keys: encryption at rest with a key per Workspace, destroyed on deletion

**Status:** draft. **Tracking issue:** #222 (label `tracking`); tickets #245 to #252 carry `spec:0028`. The decision and the options weighed are in [ADR 0012](../adr/0012-a-key-per-workspace-wrapped-by-the-installation-key.md).

## Problem Statement

A Workspace's numbers, the words people write about them and the Contacts it asks are stored in clear in Postgres. Anyone who gets a database dump, a backup, a copied disk or a query that returns more than it should reads them. Deleting a Workspace, such as an ended Trial Workspace, removes its rows, but every backup taken before still holds them for as long as backups are kept, and nobody can say when that is over.

People asked for keys of their own so that "you cannot read our data". Ziffr's server must read values to do its work (ADR 0012), so that cannot be promised. What can be promised: a dump or backup without the Installation's key holds no readable Workspace data, and a deleted Workspace becomes unreadable.

## Solution

Every Workspace gets a **Workspace Key**: 32 random bytes, made when the Workspace is made. It is stored only wrapped, under a key derived from the Installation's `ZIFFR_SECRETS_KEY`. The core seals the Workspace's sensitive columns with it (AES-256-GCM, in Node, bound to where the value lives) before they reach the database, and opens them after reading. Deleting a Workspace destroys its key first, so what is left of it anywhere cannot be read with the key the Installation keeps. The work comes in steps: free text and personal data first, then values and every copy of them, then old data re-encrypted, then the backup question below.

## User Stories

1. As an Owner, I want our Thread replies, Contacts' addresses and the descriptions we write to be unreadable in a stolen database dump, so that a leak of the database alone does not expose us.
2. As an Owner, I want our values to be unreadable in a dump too, together with every place a value is copied to (the Outbox, history, Snapshots), so that the protection is not undone by a copy.
3. As someone who tried Ziffr in a Trial Workspace, I want my data to become unreadable when the trial is deleted, and in the Installation's backups once their retention period is over, so that "deleted" means deleted.
4. As an Owner deleting a Workspace, I want to download everything first and be told that afterwards nobody, not even whoever runs the Installation, can bring it back.
5. As a self-hoster, I want the change to need nothing but the key I already have, to upgrade without downtime, and to be warned clearly that losing that key now loses every Workspace.
6. As a self-hoster, I want to change the Installation's key, and a Workspace's key, without taking Ziffr down.
7. As whoever runs Ziffr, I want the docs to say exactly what this protects against and what it does not, so that nobody promises customers more than is true.
8. Later, in `ee/`: as a business, I want my Workspace Key wrapped by our own KMS, so that we can revoke Ziffr's access to our data.

## Implementation Decisions

### Keys

- **The wrapping key** is derived from `ZIFFR_SECRETS_KEY` with HKDF-SHA256 and the label `ziffr/workspace-key-wrap/v1`, so it is never the same bytes that seal Slack tokens and settings. No new environment variable (ADR 0012).
- **A Workspace Key** is 32 random bytes. It is stored in a new table `workspace_keys` (service role only): the Workspace, a key version, the wrapped key (AES-256-GCM under the wrapping key, with the Workspace id and version as additional data), the name of the `KeyWrapper` that wrapped it, which Installation key wrapped it (current or previous), and when it was made and retired. A Workspace has one current version and may have older ones while data is being re-encrypted.
- **Unwrapped keys in memory:** cached per process for 10 minutes, at most 1,000 Workspaces, least recently used first out. A destroyed key is dropped from the cache of the process that destroyed it at once; other processes drop it within the 10 minutes, and by then the rows it opened are gone with the Workspace. Node cannot promise that freed memory is wiped; the threat model says so.
- **Changing the Installation's key** works as spec 0009 has it: set `ZIFFR_SECRETS_KEY_PREVIOUS` to the old key and `ZIFFR_SECRETS_KEY` to the new one, restart. The self-hosting guide recommends doing it once a year, and after an incident; it is cheap. A job re-wraps every Workspace Key under the new key (one row per Workspace, so it takes seconds) and the Installation settings page says when none is left under the old one; then the old key can go.
- **Changing a Workspace Key** happens when an Owner asks for it or after an incident, never on a schedule: a schedule would run the re-encryption job over every row regularly, for little gain while the Installation key changes yearly. Then a new version becomes current for writes; the re-encryption job (below) moves the Workspace's columns over; the old version is destroyed when nothing refers to it.
- **Losing `ZIFFR_SECRETS_KEY`** loses every Workspace's encrypted data. There is no recovery and no back door. The self-hosting guide, the Docker README's backup section, the upgrade note and the Installation settings page say so, in those words. Docker keeps the key in the `ziffr_keys` volume as today.

### What is sealed, and how

- **The format** of a sealed column: `w1.<key version>.<iv>.<ciphertext>.<tag>`, base64url, AES-256-GCM with a 12-byte random IV and a 16-byte tag. The additional data is `<workspace id>:<table>:<column>:<row id>`, so a sealed value copied to another Workspace, column or row does not open. Rows whose id the database makes take it first (`nextval` in the same core call), or are written by core functions that already know it.
- **A plain value and a sealed one may sit side by side** during the change: a column holds either the old plain text or a `w1.` value, and the core reads both, so nothing has to stop while old rows are re-encrypted. For numeric columns, a new text column holds the sealed value and the numeric one is emptied when it is sealed, with a check that exactly one of them is set.
- **Equality without clear text:** where the core must find a row by a sealed value, it stores a blind index next to it: HMAC-SHA256 of the normalised value with a key derived from the Workspace Key. That is a Contact's email address (the unique index on `lower(email)` becomes one on the blind index), and a Breakdown row's label (merged by label when values are added up). A blind index reveals which rows are equal within one Workspace, nothing across Workspaces.
- **Step 1, free text and personal data:** Thread messages and the text of Questions and Tasks; Metric descriptions; Contacts' names, email addresses, Slack handles and phone numbers; Breakdown labels; the words of dashboards, Findings and Snapshots (introduction, headlines, sentences); Delivery text in the Outbox; the raw text of the intake log and of inbound emails; the Audit Log's object names and details; and the Workspace's Connector secrets (Slack bot tokens), which move from `ZIFFR_SECRETS_KEY` to the Workspace Key so they die with it. **Metric names stay readable in step 1** and are sealed in step 2.
- **Step 2, values and Metric names:** Metric names, since a sealed value next to a readable name still says what is measured; Observations and their Superseded Values, Breakdown row values, Target Series and Projections, and the values frozen in Snapshots and decks. Values are copied into other text too (Deliveries, the intake log, Thread messages), which step 1 already seals, so after step 2 no value is left in clear.
- **What SQL does with values today, measured in November 2026:** aggregation, Comparisons, Attainment, the Unusual Value check and Analyses already run in the core, in TypeScript. The database computes with a value in only two places: `record_observation` (the "add up" Submission Rule adds to the stored value and merges Breakdown rows by label), and the demo's function that makes up values (`demo_reset`). Trials made up values too until ticket 263; they now start without any. `latest_observations`, `recent_observations` and `latest_breakdowns` only pass values through and keep working with sealed ones. 15 files of the core and the app read `observations`, 2 read `breakdown_rows`. No index and no check depends on a value. So step 2 is feasible: "add up" moves into the core as read, add and write back with a version check (a compare-and-swap, retried a few times), since the core cannot hold a database transaction across calls; label merging uses the blind index.
- **Not sealed:** ids, periods, dates, slugs, kinds, states, roles and Workspace settings, which the database filters and joins on and which say little alone; the people's own profiles and sign-in addresses, which belong to the person across Workspaces, not to one Workspace; and the demo Workspace, whose data is made up and public (it has no Workspace Key).
- **Trials** start with the Test Metric and no values (ticket 263), so nothing made up needs sealing.

### Search and sorting

Nothing searches Workspace text in SQL today: the lists people filter (Metrics, dashboards, the catalogue) are filtered in the browser or the core. Sorting by a sealed column (Contacts by name) moves into the core. Matching a Contact by address uses the blind index. Metric names are sealed in step 2, so the few `order("name")` calls on Metrics move into the core then, reports run directly on the database no longer read them, and any future search by text must run in the core over opened rows.

### Deleting a Workspace

- **Order:** export offered first; then the Workspace Key and all its versions are destroyed (their rows deleted); then the Workspace's rows are deleted as today. If deletion stops half-way, what is left cannot be opened.
- **The Audit Log** of a Workspace goes with it (it is deleted with the Workspace today). The Installation keeps one line in its own audit: the Workspace's id, that it was deleted and its key destroyed, and when, never its name.
- **Export before deletion:** Trial Workspaces already offer their values as CSV before they end; that stays. Deleting an ordinary Workspace is not a feature yet; when it comes, it offers a full export first and waits seven days before the key is destroyed, which is when "it cannot be brought back" starts.
- **The demo** has no key and is reset as today.
- **Backups:** destroying the key makes the live database, its replicas and every backup taken afterwards unreadable for that Workspace at once. A backup taken **before** the deletion holds the Workspace's wrapped key, and the Installation still has the key that unwraps it, so that backup still opens until it is itself deleted. The promise is therefore the backup retention period: **a deleted Workspace is unreadable in backups once the retention period is over** ("after N days", with the Installation's N). Ziffr's pages, the threat model and the self-hosting guide say it in those words, and nothing stronger.
- **Key epochs, only when needed:** making old backups unreadable by cryptography as well would need the Installation key to change on a schedule (an epoch), every Workspace Key re-wrapped under the new one, and old epoch keys destroyed after the retention window, written somewhere outside the database. That is ticket 7, built only if the hosted offering or a customer needs the stronger promise.

### Who sees that a Workspace is encrypted

- **Owners** see one line under Workspace settings: "Encrypted with a key of its own. Deleting this Workspace destroys it." No key, version or progress.
- **Installation Admins** see, on the Installation settings page, how far the re-encryption job is, which key versions each Workspace has and whether any is still wrapped under the previous Installation key. Never a key, wrapped or not.

### Moving existing data

- A **re-encryption job** (`/api/jobs/workspace-keys`, with the job secret, run by the same scheduler as the other jobs) gives every Workspace a key, then seals plain rows table by table in small batches (500 rows), and re-encrypts rows under a retired key version. Each row is written only if it has not changed since it was read. It can stop and start at any time; a page for Installation Admins shows how far it is.
- **Mixed state:** while it runs, the core reads plain and sealed rows alike and writes only sealed ones. The demo is skipped.
- **Done** means no plain row is left in a sealed column, checked by one query per column; then the plain columns for values are dropped by a later migration, in a release of its own, once every Installation had time to finish.

### Performance

AES-GCM in Node opens about a gigabyte a second; a dashboard that reads 10,000 values spends a few milliseconds opening them, after one key lookup per Workspace and request at most. Sealed values take more space: a value of 8 bytes becomes about 70 characters, so the `observations` table grows several-fold; at Ziffr's sizes (thousands to a few million values per Installation) that is acceptable, and the spec's first database test measures it.

### The threat model

`docs/security/threat-model.md` gets a boundary "Data at rest (spec 0028)": what Workspace Keys protect against (a stolen dump, backup or disk without `ZIFFR_SECRETS_KEY`; a read-only SQL leak; reading a deleted Workspace from the live database or later copies) and what they do not (a compromised app server or the core's process, a malicious operator, a memory dump, backups from before a deletion until they expire or the Installation key changes, and anything the operator keeps next to the database, such as a backup of `ziffr_keys` stored with the dump). It adds to "Accepted risks" that blind indexes show which Contacts or labels are equal within a Workspace.

### Self-hosters

- **Upgrading** needs no new setting: Ziffr makes keys and seals data by itself after the upgrade, and the release note says what happens and how to watch it on the Installation settings page.
- **The warning** before the upgrade, in the release note and the self-hosting guide: back up `ZIFFR_SECRETS_KEY` (with Docker, the `ziffr_keys` volume) separately from the database; without it, the database is unreadable. Keep the two backups apart: a dump stored next to the key protects nothing.
- An Installation without `ZIFFR_SECRETS_KEY` cannot seal: it keeps working as today, the Installation settings page says its data is not encrypted, and the re-encryption job waits until the key is set.

### Bring your own key (later, `ee/`)

Only the extension point is part of this spec: the `KeyWrapper` interface of ADR 0012 and the wrapper's name stored with each wrapped key. A paid wrapper in `ee/` would wrap a Workspace's key with the customer's KMS, so revoking Ziffr's access there makes the Workspace unreadable, and Ziffr says plainly that the Workspace then stops working.

## Testing Decisions

- **Pure tests** for sealing and opening: the format, a value under another Workspace, table, column or row refused, a changed byte refused, short tags refused, plain values passed through, blind indexes equal for equal normalised values and different across Workspaces, HKDF labels keeping the wrapping key apart from the secrets key.
- **Database tests** (`workspace-keys.db.test.ts`): a new Workspace gets a key; sealed columns hold no clear text (a test writes known words and values, then searches every row of every sealed column for them); the core reads plain and sealed rows alike; "add up" under two concurrent writers adds both; Breakdown label merge with sealed labels; a Contact found by address through the blind index and unique per Workspace; changing the Installation key and re-wrapping; changing a Workspace Key and re-encrypting; destroying a key makes every sealed row of that Workspace unopenable, and other Workspaces untouched; the demo unsealed.
- **The re-encryption job:** batches, stopping and starting, a row changed while it ran is not overwritten, the done check.
- **A dump test in CI:** after the database tests, `pg_dump` of the test database is searched for the known words and values of a sealed Workspace; any hit fails the build.
- **Performance:** opening the values of the largest demo dashboard, before and after step 2, recorded in the pull request.

## Tickets

1. `workspace-keys.ts`: keys, wrapping through `KeyWrapper`, the cache, sealing and opening, blind indexes; the `workspace_keys` table; a key for every new Workspace; pure and database tests. No column sealed yet.
2. Step 1: free text and personal data sealed on write and opened on read, Contacts' blind index, Slack tokens moved to the Workspace Key; the Owners' line in Workspace settings; the threat model boundary in place of its open-work entry. Blocked by 1.
3. The re-encryption job and its progress on the Installation settings page; plain rows of step 1 sealed. Blocked by 2.
4. Step 2: values and Metric names sealed, "add up" and Breakdown merging moved into the core with compare-and-swap, sorting by Metric name in the core, the demo and trial seeds; the dump test in CI. Blocked by 3.
5. Deleting a Workspace destroys its key first; the Installation's audit line; trials use it; the retention-period promise in the threat model and the self-hosting guide. Blocked by 1.
6. Changing the Installation key (re-wrap job) and a Workspace Key (new version, re-encryption); docs for self-hosters; release note. Blocked by 3.
7. Only when needed (the hosted offering or a customer asks for the stronger promise): Installation key epochs, so backups from before a deletion become unreadable after the retention window. Blocked by 6.
8. Later, a migration in a release of its own that drops the plain value columns once Installations have finished. Blocked by 4.

## Out of Scope

- End-to-end encryption and keys held only by people (ADR 0012).
- Bring your own key, beyond the extension point; it goes in `ee/`.
- Adding Infisical, HashiCorp Vault or a cloud KMS to the stack.
- Encrypting people's profiles and sign-in data, which Supabase Auth keeps and which belong to the person, not to one Workspace.
- Disk and volume encryption, which the self-hosting guide recommends but Ziffr does not do itself.
- Searching Workspace text in SQL.

## Decisions (2026-11-19, by the owner)

The open questions of the draft, answered as recommended and folded into the decisions above:

1. **Backups:** the promise is "unreadable in backups after the retention period". Key epochs stay a later ticket (7), built only if a customer needs the stronger promise.
2. **Values** are encrypted, as step 2.
3. **Metric names** are sealed in step 2, with the values.
4. **No schedule** for Workspace Keys: they change when an Owner asks or after an incident. The Installation key is changed yearly.
5. **Who sees it:** Owners see one line in Workspace settings; Installation Admins see progress and key versions, never a key.
