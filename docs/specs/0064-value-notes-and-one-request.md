# 0064 Value Notes, and one request for everything that is due

**Status:** draft. **Ticket:** no tracking issue yet. It takes over #1176 (a note on **Record a value**).

## Decisions for you

1. **What the setting offers, and its default.** Recommended: **Ask for a note** with **Always** (whenever only a number came in), **Only when off target or unusual** and **Never**; the default is **Always**, for existing Metrics too. Context: the question is a line in a confirmation Ziffr already shows or sends, so asking creates no extra email.
2. **How a later reply is read.** Recommended: once a person's value is in, only a number standing alone changes it, and any other words are the note. Context: this changes today's behaviour, where "actually 45" overwrites or adds to the value, but a note such as "3 deals slipped" must never become the value.
3. **How several figures are answered by text.** Recommended: one line each ("1: 45"), and plain numbers in order only when there is exactly one for every open figure; anything else is asked back. Context: guessing which figure a number belongs to would record wrong numbers without a sound.
4. **One link for all figures.** Recommended: the one message carries one link that opens a form for exactly those figures without sign-in, for 30 days. Context: a forwarded message then opens several figures, where today's form link opens one.
5. **Notes after Approval or Lock.** Recommended: a note may still be added or corrected, is marked "added later", and starts no new Approval. Context: the value is recorded at once, so the note often arrives after the Approver was asked.
6. **Who may write a note.** Recommended: whoever sent the value (their own), and the Metric Owner and Editors (any period, Derived Metrics and Totals included); Approvers and Viewers read it. Context: the Approver already has the Thread for questions, and one clear author keeps the note trustworthy.

## The owner's words

On Value Notes (agreed "yes"): "for slack, teams, mcp, telegram, emial, baiscally any interacgive channel we sould ask if a comments shoudl be attached if only a number was given (also optional settign for the number)".

Then: "this might even be a workflow step: only number was submitted, send again askign for a comment..nit sute, or if this would ratehr be a settign at the metric sitself". On the recommendation to make it a setting of the Metric: "yes, make it a metric setting".

On one request (said twice): one email per Metric is too many. One message for each person and run, one form for all, one reminder for what is missing, the same in chat.

## Problem Statement

A person who owes eight numbers gets eight messages. Each says one number and nothing about why it is what it is, and Ziffr has nowhere to keep that. The people who read the number ask for the reason afterwards, in a meeting or in a Thread.

### What exists today

Read from the code on `main` (791df008):

- **One Prompt, one message, per Metric.** `runWorkflows` (`workflow-engine.ts`) walks the Metrics one by one and calls `deliverPrompt` for each person to ask, remind or escalate. **Ask for missing values** (`questions.ts`) and a Set up from a Pack (`pack-setup.ts`, through `createMetric`) do the same. Each Prompt makes its own Delivery for each way, with its own form link (`form_token_id`) and reply address.
- **No note.** An Observation has no field for one, and no way of sending a value takes one.
- **A reply with a reason is refused.** "45" followed by "3 deals slipped" holds two numbers, so nothing is recorded (`readAnswer`).
- **A later reply is read as a value.** A second message in a Slack thread, or a second reply to the email, goes through `submitValue` again (`reply-routing.ts`).
- **No Microsoft Teams Connector exists.** The Connectors are Slack, email, Telegram, WhatsApp and tickets (`connectors/types.ts`); the last two are simulated.

What answers a value today, and so where a question can go:

| Way | What Ziffr answers | Can the person answer that? |
| --- | --- | --- |
| Email reply the provider vouched for | A short email "Recorded" or "Not recorded" (`inbound-email.ts`), only where mail is set up; not in the Outbox | No: it has no reply address |
| Email reply nobody vouched for (Held Reply) | One email with a link to confirm; no "Recorded" email. The page behind the link shows the reply, its effect and then the result | On that page only |
| Slack | A message in the thread | Yes, but it is read as another value |
| Telegram | A reply to the person's message | No: Ziffr does not keep that message's id |
| Personal form link | The result on the page | The form stays |
| **Record a value**, **Fill in for …** | The result in the panel | The form stays |
| AI assistant | The tool result, which may carry words for the assistant | Yes, in the chat |
| API and Feeds | A JSON answer | A program, not a person |
| WhatsApp, tickets | Nothing real: simulated | Not applicable |

## Solution

1. **One message for each person and run.** The Prompts a run sends one person travel together: one message listing every figure that is due, one form for all of them, and one reminder for what is missing.
2. **Value Note.** An optional note with a value saying what is behind it. Where only a number was given in an interactive way, Ziffr asks once, inside the confirmation, whether to add one. A Metric setting says when it asks.

Both share three things: the list of figures a message holds, one reader for replies with several lines, and one question that can name several figures. They are therefore built together.

## User Stories

1. As a Submitter with eight numbers due, I get one message and send them in one go.
2. As a Submitter, I answer the ones I know now and the rest later, and I am reminded once about what is missing.
3. As a Contact, I fill in every number on one page without signing in.
4. As a Submitter, I add a line saying why the number is what it is, in the same reply.
5. As a Submitter who sent only a number, I am asked once whether to add why, and I may ignore it.
6. As an Approver, I read the note beside the value I am asked to approve.
7. As the person who puts the review together, the deck says what is behind each number, without my collecting it.
8. As a Metric Owner, I choose when my Metric asks for a note.
9. As anyone reading a past period, I see what was said then, and what was corrected.

## Implementation Decisions

### Words (glossary, with the ticket that builds each)

- **Value Note** (new): words about one period's value of a Metric saying what is behind it, written by who sent the value or by who looks after the Metric. It never changes a number and is seen by whoever sees the value. Not the Calculation Note (how a Metric is calculated) and not a Thread (replies on a Question or Task). _Avoid_: comment, annotation, remark, commentary.
- **Combined Prompt** (new): one message that carries several Prompts to one person, with one form for all of them. Each value still answers its own Prompt. _Avoid_: digest, batch, bundle, summary. (The owner says "one request"; screens may say "your numbers".)
- Changed: Prompt, Delivery, Token, Metric Description, Held Reply, Approval, Superseded Value, Period Record, Period Timeline, Retention, Snapshot, Slide Element, View Link, Values Download, Workspace Export.

### Part 1: the Combined Prompt

#### What goes together

- **The same person, Workspace and way, in the same run.** A run is one occasion on which Ziffr asks for several figures: one call of the Workflows job for a Workspace (its daily run and every Asking Schedule due at that call), **Run workflows** by hand, **Ask for missing values**, or one Set up from a Pack. **Ask me now**, a new Metric and a newly added Submitter ask for one figure. Nothing is combined across Workspaces.
- Asking, reminding and an Escalation to a Stand-in are all included. A Stand-in's own figures and those they answer for someone stand in one message, the latter marked "for Sara".
- Not included: Questions, Tasks, Approvals, Checklist Items, Alerts and reminders of Tasks.
- **Routing is unchanged.** `routePrompts` still decides for each figure which ways it goes by. A message on a way holds the figures whose route includes that way. A person with one way and Metrics that all accept it gets exactly one message.
- **One figure** is worded and sent as today.
- Quiet Hours hold the whole message. A figure no way reaches stays a "Not sent" line of its own in the Outbox, and its Metric Owner is told as today.

#### The reminder

If a run has at least one Remind step due for a person, they get one reminder. It lists every figure Ziffr asked them for that is still missing and due, those with a Remind step today first. It goes by each figure's first way. When the same run also asks for new figures, both stand in one message, in two parts ("New", "Still missing"); a way that is only the second or third lists the new ones only.

#### What it says

```
Subject: 3 numbers due: Revenue and 2 more

Hi Sara,
1. Revenue, October 2026, due 4 Nov
2. New customers, October 2026, due 4 Nov
3. Open tickets, week of 26 Oct 2026, still missing, was due 3 Nov

Reply with one line for each, such as "1: 45". Words under a number are its note.
Or enter them on one page: [your link]
```

- Figures a way cannot take as a reply stand under "Only on the form". Where a Metric refuses the Web form, its figure says "Reply here" and is not on the form.
- A Combined Prompt holds at most 50 figures. Slack and Telegram list the first 20 and then "and 12 more on the form"; a message is split only when some of the rest cannot be answered on the form.

#### How it is kept and sent

- Each figure stays a Prompt row of its own, so closing, the Period Timeline, Stand-ins and asked periods work as today. A new table lists a Delivery's Prompts with each one's position, Token and answer Source. Everything that reads `deliveries.prompt_id` today learns the list: reply routing, Held Replies, closing the other ways, the checks before sending, the Period Timeline and **Ask me now**.
- **The words are composed when the message is sent**, from the figures that are still open and allowed: not answered, not archived, the Token still valid. With none left, nothing goes. Positions are fixed at that moment.
- A figure answered another way is marked in the other messages ("Answered on email"), never replacing the whole message. Slack and Telegram messages are edited; an email cannot be.
- A Metric's step counts as done in `period_states` only once the person's message exists, so a run that fails half way loses nobody.
- The barrier of a Practice Workspace (spec 0063), a trial's limits and the demo hold for every new message, confirmation and link here.
- A reply address takes 20 replies plus 2 for each figure, at most 60.
- A Held Reply keeps up to 5,000 characters (1,000 today), and its confirmation page lists every figure, value and note.
- **Outbox:** a Combined Prompt names a sender only when all its figures come from Workflows of one owner; otherwise Ziffr sends it. Nobody but the recipient and that sender sees it, and a Guest reads no names in it.

#### The combined form

- One address, `/submit/all/<code>`, a Phone-first page. The code is 32 random bytes made when the message is sent; Ziffr keeps only its hash. It works for 30 days.
- It is **no Token**: it stands for the (Token, period) pairs of that message. Each submission is checked live against its own Token (still valid, still Stand-in, the period still running or asked, the Metric still taking form values) and goes through `submitValue`.
- It shows for each figure what that figure's form link shows today: name, description, period, the value already there and the Submission Rule. It shows no existing note, no other Metric, no Token code and no link to one.
- One number field and one note field for each figure (the note one tap away on a phone), a Breakdown field behind a button, and one **Submit**. Empty rows are skipped. Each row says what became of it, and the page can be opened again for the rest.
- Attempts are limited for each link, as sign-in attempts are.
- **Slack** also offers **Enter all** on the message: a window with the same fields, up to 40 figures. Ziffr acknowledges Slack at once and posts the results in the thread. Telegram uses reply lines or the form.

### Part 2: Value Notes

#### What a note is

- It belongs to a Metric and a period, and was said of a value. Plain text, at most 1,000 characters, line breaks kept.
- **The value is recorded at once and a note never blocks it.** The note is saved after the value. If it cannot be saved, the answer says so and the value stands. A value that is refused saves no note.
- **History for each period.** Entries are added and never rewritten, each with author, time and the way it came in.

| What happens | The note |
| --- | --- |
| The author or an Editor corrects it | The new entry shows; the earlier one stays in the history |
| The value is replaced (overwrite, Correction, Self-check, a Filled-in Value replaced) | Its notes leave the current view and stay in the history, "said of 45". The new value has the note sent with it, or none |
| Submission Rule "add" or "keep both" | Each contribution's note stays current, newest first |
| The same value and the same words again (a nightly Feed) | Nothing new |
| Removed | The words are hidden and the history says who removed it |
| **Delete the words for good** (Metric Owner, for something that should never have been written) | Emptied in the history, in Snapshots, frozen View Links and the intake log. Messages and files already sent keep them, and the dialog says so |

A period keeps at most 50 entries.

#### Who writes and who reads

- **Writes** (recommended, decision 6): whoever sent a value, on their own; the Metric Owner and Editors, on any period. A Stand-in or whoever fills in writes the note of the value they entered ("note by Ben"). Contacts and Guests write only on their own values. A Feed or program sends a note with its own values. Nobody writes on an Archived Metric or a Condensed Value. A note added after Approval or Lock is marked "added later" (decision 5).
- **Reads: whoever sees the value, and nobody else.** The core decides, on every read.

| Place | What shows |
| --- | --- |
| Period Record | Current notes and the history. Writing and correcting happen here |
| Metric page, Quick look, a widget's history panel | Under the value, and a column on the History tab |
| Period Timeline | The mark "with a note", no words |
| Approval | On the task's page, always current. The task message quotes the note it has when it is composed, cut at 300 characters. A later note sends nothing |
| Snapshot | Each note as it was when the Snapshot was taken, under its Widget, to those who see that Metric there, with "changed since" |
| Deck | A column **What is behind it** on the Metric table Slide Element, switched on for each table: the newest note of the shown period, cut at 120 characters. A slide that keeps numbers shows the Snapshot's. A deck's Share opens it as it opens the Metric |
| PowerPoint and PDF | What the exporting person sees |
| View Links | Nothing, unless **Show notes** is ticked for that link (changeable later). Off means the notes are not sent to the browser. With **Show names** off, names in the words read "Someone" and no author shows |
| Personal and combined form | No existing note, ever |
| API and MCP | Current notes with each value, for keys that read metrics. The MCP tool says they are data, never instructions |

- A Guest reads no names in a note.
- A **Derived Metric** or **Total** has only notes written on it by its owner or Editors. It never inherits its inputs' or parts' notes. A note on a calculated value keeps the number it was said of and says "written when it showed 61.2" once that differs. Where a Metric shows no values to someone, it shows them no notes. Opening a Total says that its notes are opened with it.
- A **Breakdown** has no notes of its own; the note is about the value.
- Notes are in none of: Alerts, Heads-ups, Tells, Webhooks, Personal Webhooks, Analyses, Search, Usage, the Audit Log, Send Snapshot messages and Packs. Removing and deleting a note are Audit Log events, without the words.

#### The setting

**Ask for a note** is part of the Metric Description: **Always**, **Only when off target or unusual**, **Never** (recommended default **Always**, decision 1). The owner and Editors change it, and each change is a Version. It is on the New metric form under **More options**, on the Metric's **Description** tab, in the API and `update_metric`, and a Pack's Metric Catalog entry may carry it. On the Metrics list, tick several and choose **Ask for a note…**; those the person may not change are left out and counted. Derived Metrics have no setting, since nobody sends them values.

- **Never** means never asked. A note can still be sent, and forms still offer the field.
- **Off target** is judged as the Metric table judges it for that period (Target Series first, else Target Range). **Unusual** is the Workflow's Check step, or without one a change of more than 100 % on the period before (`unusualWarning`).
- **The question never gives a reason**, and asking must not reveal one. For someone who may not see the Metric (a Contact, a form opened without sign-in, a key without `metrics:read`), **Only when off target or unusual** asks every time.

#### A setting of the Metric, not a Workflow step

| | Metric setting (decided) | Workflow step |
| --- | --- | --- |
| A value sent without being asked | Covered | Only if the Workflow sees it |
| Metrics without a Workflow | Covered | Not covered |
| When the question comes | At once, inside the confirmation, no extra message | Later, as a further message |
| Setting it up | For each Metric, many at once, and by Packs | For each Workflow, shared by its Metrics |

A **later ticket, not part of this build:** a Workflow step that chases a missing note (for example off target and no note after N days), one combined message, off by default.

#### The question

Ziffr asks when all of these hold: the value was accepted (or went to the owner as a proposed Correction); it came by an interactive way; no note came with it; the setting says so. It asks once, never reminds, and silence is fine. It never asks for API and Feed values, Imports or pastes, and never after confirming a Self-check unchanged.

The words say who will read it: "Anything behind it? Reply with a few words, or leave it. Everyone who sees this Metric can read them." For several figures, one question: "Anything behind them? Reply "1: your words" (1, 3)."

| Way | Where the question goes | How it is answered |
| --- | --- | --- |
| Email, vouched | In the "Recorded" email, which now carries the reply address | Reply with words. A saved note sends **no** email back, except when it holds a number ("Saved as your note. To change the value, send the number alone"), could not be saved, or must ask which figure |
| Email, Held Reply | No email. The confirmation page shows the value and any note, with an optional note field above **Confirm** | In that field. A later reply is held like any reply |
| Slack | In the thread confirmation, with **Add a note** and **No note** | Reply in the thread, or the window the button opens (a field for each figure) |
| Telegram | In the confirmation, which opens the reply box ("What is behind it?"). Ziffr keeps its message id | Reply to it, or to the request |
| Personal form, combined form | After saving, the result opens the note field again | **Save note**. The link may only write on values its own Token just recorded or owns |
| **Record a value**, **Fill in for …** | The same, in the panel | The same |
| AI assistant | The tool result says to ask the person | `add_value_note`, or `value_note` on `submit_value` |
| API, Feed | Never asked | `value_note` with the value, or the note call |
| WhatsApp (later) | In the free text confirmation, inside the window their reply opened | A reply there |

A value proposed for a locked period carries its note with the proposal. The note becomes the period's Value Note only if the Correction is accepted.

**AI assistants.** `submit_value` and `create_metric` (with a first value) take `value_note`. The API answers `value_note_wanted`, worked out by the core, and the MCP Server turns it into an instruction: ask the person; record only their words; never write a note yourself. Several values are asked about once, together. `add_value_note` writes on a value the key's creator may write on. The existing result field `note` (words for the assistant) keeps its meaning, which is why the new names say `value_note`.

#### Reading a reply

One pure function reads every text reply, for single and Combined Prompts.

**Cleaning, email only.** Quoted text and what follows a "-- " line are removed, as today. A note also ends at the first empty line after it starts (one between number and note is allowed). It ends at a closing line ("Best regards", "Viele Grüße", from a fixed list per Answer Language), at "Sent from my …", or at a line that is only the sender's name. A greeting line at the top is skipped. Chat messages are taken whole.

**The first reply, one figure.** The value line is the first line that still holds a number once period words are taken out. It is read as today, and the lines after it are the note. Period words may stand on it or alone above it. Several numbers on that line, or a later line that is only a number, record nothing and ask back, as today. Words on the value line are not turned into a note, so the question follows. With no number anywhere, nothing is recorded.

- A reply is a **Breakdown** when its first value line is a labelled row and there are at least two rows, or when a lone number is followed only by at least two rows that add up to it. Lines after the rows are the note. Otherwise lines under a lone number are the note.

**The first reply, several figures.** A value line is "1: 45" or the Metric's full name, a colon and a number that stands alone (unit, currency or percent sign allowed). Lines under it are its note. Without any such line, number-only lines are taken in order, only if there are exactly as many as open figures (decision 3). Each figure read clearly is recorded; the rest are listed as still open. The confirmation names every figure, value and saved note.

**A later reply,** once this person's value for the Prompt's period is in, by whichever way (decision 2):

| The reply, once cleaned | Read as |
| --- | --- |
| A number alone ("45", "45 €", "October: 45"), also after "1:" or "Correction:", or a Breakdown | A new value, by the Submission Rule; the lines left over are its note |
| A refusal or thanks alone ("no", "nein", "-", "thanks"), from a fixed list per Answer Language | Nothing saved; the question is closed |
| Anything else, numbers included | The note of the one figure it can mean; a second one replaces the first, and the answer says so |
| The same, where it could mean several figures and no "1:" says which | Nothing saved; Ziffr asks which, in the same place |
| Nothing left | Nothing |

- Before a value is in, words alone are not a note: they are refused as today.
- Late replies keep today's limits (30 days, a number of replies, only from that person, only while the Token holds). If the value was replaced meanwhile, the note is filed under the person's own earlier value, and the answer says so.
- A message marked as automatic is never read. A reply nobody vouched for is held first, note or not.
- **Chats without a reply link.** Slack and Telegram keep refusing a message outside a thread or reply. A later Connector without threads may attach a message only when exactly one question is open, asked in the last 15 minutes, and the message is not a lone number; otherwise it asks which.

#### Approval, Correction and other values

- Approval is unchanged. Notes are never read as "approve", "send back" or "confirm"; those belong to Tasks.
- The words of a send-back or a proposed Correction stay in the Thread, which may be limited to a Group. They are **never copied** into a Value Note. Accepting a Correction offers the owner a note field.
- A Self-check's page has the note field.
- A message about a Filled-in Value shows its note to the Submitter.
- Imports (a Feed's history) may carry notes and are never asked.

#### Untrusted input

Notes are checked in the core wherever they arrive: a string, trimmed, control and direction characters removed, 1,000 characters. A reply or form cuts a longer one and says so. A program's longer note is not saved (`value_note.saved: false` with the reason), and its value is. Words are drawn as text, escaped for Slack, kept from looking like Ziffr's own button in email, guarded against formulas in CSV files, and escaped in PowerPoint files. Ids from a browser, a button or a link are checked against the Workspace and the person. Logs never hold the words.

#### Storage, deletion and files

- Add-only migrations: the notes, the questions asked (Delivery, figure, message id, open or closed), a Delivery's Prompts, the combined form's hash and the Metric setting. Each new table gets the demo guard, its demo classification and its place in the Practice Workspace copy, and goes with its Workspace and Metric.
- Note words are sealed with the Workspace Key (`SEALED_COLUMNS`, the key change job included). Deleting the Workspace destroys the key.
- Removing a person keeps their notes, named as their values are.
- **Retention** removes the notes of periods it condenses or deletes. Its preview counts them, and the download before a delete holds them. Snapshots and frozen View Links keep their copies, as they keep numbers.
- **Values Download** and the Workspace's CSV gain a **Note** column.
- **Workspace Export and Import** carry notes with their history, authors as names, and the setting. The format refuses unknown fields, so the file gets a new format version only when it holds either.
- A Pack carries the setting and never a note; a copied Metric and a Metric file carry the setting only. An older Ziffr refuses such a Pack by the format's own rules.

### What a future Teams Connector must provide

This spec does not specify one. To carry both parts it needs: proof of who sent a message; a link from each reply to the message it answers (or a card that sends our reference back); one confirmation in the same conversation; its message length and, if it has forms, their size; editing a sent message; and a count of the people and messages it may be asked to reach.

### WhatsApp

There is no real Connector yet (#6). For it: a message that starts a conversation needs an approved template. Template parameters take no line breaks, and the body is at most 1,024 characters, so a template says how many numbers are due and carries the combined form link, without a list. Lists, numbered replies and the question belong in the 24 hours after the person last wrote. No template is ever sent only to ask for a note. Check Meta's current rules and prices when #6 is built.

## Tickets

Each is one pull request, with its release note and the user guide chapter for any screen it changes. Tickets 2 and 3 build pieces that nothing uses yet: runs keep sending single Prompts until ticket 5 switches the Combined Prompt on, so `main` never sends a message it cannot answer.

| # | Ticket | Needs first | Check | Security review |
| --- | --- | --- | --- | --- |
| 1 | The reply reader: value lines, numbered lines, notes, cleaning, refusals; pure, not yet wired | | A table of cases per rule above, English and German; every reply accepted today still gives the same number, except the cases this spec names | Sonnet |
| 2 | Value Note core: tables, sealing, writing and reading with visibility, note with a value, history when values change, Retention, delete for good | | Database tests per row of the history and visibility rules | Opus |
| 3 | Combined Prompt core: the list of Prompts, collecting in a run, the reminder, composing at send time, marking answered figures, the Outbox | | Database tests: one message per person, way and run; lost sight, archived and answered figures drop out; a failed run asks the rest | Opus |
| 4 | The combined form, note fields on both forms and in **Record a value** and **Fill in for …** | 2, 3 | Phone checks at 390 and 320; the link opens nothing beyond its figures | Opus |
| 5 | Replies: wire the reader into email, Held Replies, Slack and Telegram; numbered answers; later replies; switch the Combined Prompt on | 1, 2, 3, 4 | Database tests per row of the later reply table; release notes | Opus |
| 6 | The question: the setting (also in bulk), asked in every confirmation, reply address, Telegram reply box, Slack buttons and windows (notes and **Enter all**) | 4, 5 | Asking sends no email of its own in any path; the question reveals no reason | Opus |
| 7 | API and MCP: `value_note`, the note call, `add_value_note`, `value_note_wanted`, Feeds | 2, 6 | Client and MCP tests; a key without read learns nothing | Opus |
| 8 | Showing and editing notes: Period Record, Metric page, History, Quick look, Timeline, Approval page and message | 2 | Phone checks; Guest and Total cases | Opus |
| 9 | Snapshots, the deck column, View Links with **Show notes** | 8 | Payload tests: an off link holds no note | Opus |
| 10 | Files: Values Download, Workspace download, Export and Import, Packs | 2, 6 | Round trip; formula guard | Opus |
| 11 | Glossary check, user guide chapters 04, 10, 11, 12, 14, 16 and 17, threat model, demo data, and a review of the whole spec | all | `pnpm precheck`; a real email, Slack and Telegram round trip tried on a phone | Opus |

Order: 1, 2 and 3 side by side; then 4 and 8; then 5. That is the first release worth making: one message, one form, notes in replies and on screen. Then 6; then 7, 9 and 10; then 11. The deck builder proof (`deck-builder-pptx-proof`, not on `main`) has a **What is behind it** column on its scorecard; it reads the same core loader as ticket 9.

### Estimate

Calendar time for Claude Code with parallel agents, from this repository's throughput: 53 pull requests merged on 2026-11-26, a five-ticket feature in about 5 hours from ticket to merge, and pull requests of over 1,000 added lines taking a median of 1.5 hours from opened to merged (the last 150 merged).

| Up to | Calendar time |
| --- | --- |
| One message, one form and notes shown, live on `main` (tickets 1 to 5 and 8) | 7 to 10 hours |
| Everything (tickets 1 to 11) | 16 to 22 hours of building, so about 3 calendar days with your rounds |

What bounds it: tickets 3 to 5 follow one another; one database test run at a time on the laptop; an Opus review round on most tickets; CI for each merge; and trying real email, Slack and Telegram on a phone.

## Testing Decisions

The reader is tested as a table without a database. The core operations get database tests for visibility: a person who may not see the Metric gets no note by any loader, link, file or message. Each question path is tested to send no additional email. Replies a user can send today keep their meaning except where this spec says otherwise, and a test names each such case.

## Out of Scope

- The Workflow step that chases a missing note.
- A Teams or WhatsApp Connector.
- Notes for each Breakdown row, a note column in **Paste values**, notes on dashboard widgets.
- Merging messages of different runs that Quiet Hours release at the same time.
- A Telegram mini app; a Workspace-wide default for the setting.
- Combining Questions, Tasks or Approvals into the same message.
