# 0071 Delete your account

**Status:** in progress. **Tracking issue:** #1412 (label `tracking`); tickets #1413, #1414, #1415, #1416, #1417, #1418 carry `spec:0071`, in the order listed under Tickets.

## Problem Statement

Nobody can delete their account in Ziffr. A person disappears only when a trial or an unused Workspace is deleted, or stays after an Owner or Admin removes them from a Workspace. Spec 0066 leaves account deletion out because it needs rules for Workspaces, owned things, names in history and backups. Those rules are here. Account deletion works without billing; billing later builds on it.

## Solution

A person deletes their account in their own profile settings. If none of their Workspaces is shared, it happens at once. Otherwise it happens seven days later and they can keep the account until then. When the data is gone, Ziffr sends one last email that says so. Separately, an Owner can transfer ownership of a Workspace in one step.

## User Stories

1. As a person who works alone, I want my account and data deleted as soon as I confirm, so that I do not wait for something that concerns nobody else.
2. As a person who shares a Workspace, I want seven days to change my mind, so that a mistake can be undone.
3. As a person about to delete, I want to see what is deleted, what stays and who takes over, before I confirm.
4. As the last Owner of a shared Workspace, I want it to go on without me, with a new Owner named by Ziffr.
5. As someone who becomes Owner this way, I want to be told when it is announced and when it happens.
6. As a colleague, I want the values, comments and approvals of someone who left to stay, so that our record is complete.
7. As a person who deleted their account, I want an email that confirms my data is deleted, and says what remains and for how long.
8. As an Owner, I want to hand a Workspace to a colleague in one step, whether or not I ever delete my account.

## Implementation Decisions

### Which way it goes

- **Shared Workspace:** one where the person is an Owner, Admin or Member and at least one other person is too. Guests, Contacts, Feeds, open invitations and View Links do not make a Workspace shared.
- **At once:** the person has no shared Workspace. Being a Guest somewhere does not delay it.
- **After seven days:** they have at least one shared Workspace.
- The core decides this, never the browser, and decides it **again** when the deletion runs.

### Asking for it

- **Where:** Settings, the person's profile. Not in Demo Mode.
- **What the page lists first:** each Workspace with what happens to it (deleted, or continues; who becomes Owner; who takes over what the person owns), what is erased, what stays, and the day. For each Workspace that will be deleted and that the person owns, it offers the **Workspace Export**.
- **Confirmation:** a code sent to the person's address, asked for even in a fresh session. Only the person themself can ask; no Admin and no key can.
- **Refused** for the only Installation Admin of an Installation while other people use it: they name another first.
- **During the seven days** nothing changes: the account works, prompts go out, keys work. Every page shows the day and **Keep my account**, and an email says the same, with a link to keep it. Keeping it needs a signed-in session only.

### What happens when it runs

In this order, per Workspace:

1. **The person is its only Owner and nobody else is an Admin or Member:** the Workspace Key is destroyed first, then the Workspace and its rows (spec 0028). The Installation audit keeps one line with the Workspace's id, never its name. Guests of it are emailed when it happens.
2. **Shared, and they are its only Owner:** the longest-standing Admin becomes Owner; if there is none, the longest-standing Member. That person is emailed.
3. **Shared, continuing:** the longest-standing Owner takes over what the person owns, through the same hand-over as removing a member (`hand_over`): Metrics, dashboards, widgets, decks, templates, Themes, Workflows, open Actions and approvals. Their keys, View Links, Shares, Group memberships and open invitations end. The Owner is emailed what they took over.

Then, for the person: sign-in, sessions, connected assistants, Personal Webhooks, chat and calendar connections, preferences, Alerts and invitations to their address are removed. Their name, email address, phone number and chat handles are erased.

### Names in history

- A person with nothing left that refers to them is deleted entirely.
- Otherwise their row stays as a **Deleted person**: no sign-in, no address (a placeholder that cannot receive mail and cannot collide), no name. Values, Threads, approvals and versions show "Deleted person".
- **The Audit Log** keeps the name in its entries until they expire (730 days).
- **Version messages** Ziffr wrote with the name ("Handed over from …") are rewritten to "Deleted person".
- **Text that copied the name** stays as written: sentences people typed, Snapshots, messages already sent.
- The same address may sign up again later, as a new person. Nothing is kept to recognise it.

### Transfer ownership

- **Who:** only an Owner, for their own role. Not an Admin, not an Installation Admin, not a key.
- **What:** the Owner picks an Admin or Member. In one step that person becomes Owner and the former Owner becomes an Admin. Other Owners keep their role. What each of them owns (Metrics, dashboards and so on) does not move.
- **Where:** the members list in Workspace settings, with a confirmation that says billing and removing Owners go with the role. Not in Demo Mode.
- Checked in the database in the same step, so two changes at once never leave a Workspace without an Owner. Both are emailed, and the Audit Log records it.
- Changing roles one at a time stays as it is.

### Reliability

- The deletion is a job with a stored state. Every step can run twice; a step that fails is retried by the next run and shown to Installation Admins by id. It is never only logged and forgotten.
- It is finished only when the sign-in service no longer knows the person.
- The person is signed out as soon as it starts.
- Anything outside the database that must be cleaned up (later: billing) is a step of the same job.

### The emails

- **On asking (seven-day path only):** the day, what happens, the link to keep the account.
- **To a new Owner and to whoever takes things over:** as above.
- **The last one, after the job finished:** "We have deleted your account and your data." It says what remains: "Deleted person" in shared history, the name in Audit Logs for up to 730 days, and backups made before today until they are deleted after N days (the Installation's number; the wording of spec 0028, nothing stronger).
- The address is kept only for this email: stored sealed when the job starts, removed once sent, and removed after seven days of failed sending at the latest. An Installation without email skips it.

### Glossary

Adds **Deleted person**. The change that builds this says in the glossary that "account" means a person's sign-in and details, never a Workspace.

## Testing Decisions

- Core against the database. A table test of the paths: alone; alone in several Workspaces; alone with Guests; a Guest elsewhere; shared as Owner, Admin and Member; only Owner with an Admin, with only Members; membership changing during the seven days in both directions; keeping the account.
- A test lists every table that refers to a person and fails when a new one is not marked **erased**, **kept as Deleted person** or **handed over**.
- After the job, no table other than the Audit Log holds the person's address, and the sign-in service has no such user.
- Each step interrupted and run again ends in the same state. The last email is sent once.
- Transfer ownership: refused to everyone but an Owner, to a Guest or a Contact as the new Owner, and in the demo; never leaves a Workspace without an Owner.
- The pages are tried in the running app at 390 and 320 wide.

## Tickets

1. The inventory and the erasing of one person in the core and database, with the table test.
2. Plan, ask, confirm and keep: the core, the profile page, the banner. Blocked by 1.
3. The job: new Owner, hand-over, Workspace deletion, sign-in removal, retries. Blocked by 1 and 2.
4. The emails, including the last one. Blocked by 3.
5. User guide, threat model, privacy wording, release note, security review of the whole.
6. Transfer ownership, with its user guide lines and release note. Not blocked.

## Out of Scope

- An Owner deleting one Workspace while keeping their account (still to come, spec 0028).
- An Installation Admin deleting someone else's account, or moving a Workspace's ownership.
- Contacts: person rows a Workspace made for someone without a sign-in belong to that Workspace, even when the address is the same.
- Billing. The billing spec must say what happens to a paid Size when the person who pays deletes their account. Spec 0029 refuses to delete a Workspace with a paid Size and keeps charging the old payer when they leave; both need to change for this deletion.

## Decisions (2026-11-28, by the owner)

1. The name becomes "Deleted person" everywhere the app reads it from the person, version messages included; the Audit Log keeps it until its entries expire.
2. Only other Owners, Admins and Members make a Workspace shared; Guests do not.
3. No shared Workspace: deleted at once, Guests or not. Otherwise after seven days.
4. A shared Workspace losing its only Owner gets a new one automatically: an Admin before a Member, longest-standing first.
5. An Owner takes over what the leaving person owns.
6. A last email confirms that the data is now deleted.
7. The only Installation Admin cannot delete their account while others use the Installation.
8. Nothing is kept to stop a second trial after deleting and signing up again. **Accepted risk:** someone can repeat trials this way.
9. There is a general Transfer ownership, done only by an Owner, in one step.
10. Built now, merged after 0.21.0 is released.
