# 0032 Alerts: anyone who sees a Metric can be told when it reaches a level

**Status:** draft. **Ticket:** #359 (the owner's wish, 2026-11-20); the tracking issue and the sub-issues labelled `spec:0032` are made once the owner has read this spec.

## Problem Statement

Ziffr asks people for numbers and checks them, but it does not tell the people who care about a number when it gets somewhere. A Workflow's Check step only marks an Unusual Value for Approval: that goes to the Approvers, for a value they must confirm, not to the person who wants to know that sales passed 80 % of target or that the balance fell under 10,000. Those people open dashboards and look, or they do not look and find out a week late.

An Alert fixes that for one person at a time, without making anyone else's life harder. It must not become a channel for numbers to reach someone who may not see them, a way to spam a Workspace, or a second way to be asked for values.

## Solution

An **Alert** is a person's own standing request, on one Metric they may see, to be told through their Delivery Preference when its latest value meets a **condition**. Four kinds of condition:

1. **Reaches a share of target:** Attainment is at or above a share, such as 80 %.
2. **Reaches a value:** the value is at or above a number, or **falls below** one (two separate choices).
3. **Changes more than a share:** the latest value differs from the period before by more than a share, the Comparison's change.
4. **Not in by its Due Date:** the value for a period is still missing the day after its Due Date.

An Alert fires **once per crossing**: it tells the person when the condition becomes true and is quiet until it has been false again. Each message says what happened with the value, the target and a link, and carries nothing the person could not open on the Metric's page. A team that wants everyone told gets a Workflow step **Tell** (last ticket); personal Alerts never reach another person.

## User Stories

1. As anyone who sees a Metric, I want to be told when it reaches 80 % of its target, so that I need not open the dashboard to find out.
2. As a person watching cash, I want to be told when the balance falls below a number I name, so that I can act the same day.
3. As a sales lead, I want to be told when a value changes more than 20 % against the period before, so that I hear it from Ziffr and not from a customer.
4. As a person who needs a Metric's value for a meeting, I want to be told when it is still missing after its Due Date, so that I can ask without checking each day.
5. As a person who set an Alert, I want one message when it is true and none until it has been false again, so that a value that stays high does not ring me every period.
6. As a person, I want Alerts to use my Delivery Preference (email, Slack or Telegram), or one way I pick for one Alert, and to find every one in the app, so that nothing is lost in a channel I do not read.
7. As a person who lost sight of a Metric, I want its Alerts to stop without a message that says why, so that Alerts never confirm that a Metric exists.
8. As a Metric Owner, I want Alerts not to change how my Metric is checked or approved, and not to count towards its numbers in any way, so that Alerts stay a reading, not a process.
9. As someone who has pasted two years of history, I want no storm of messages, so that bulk loading a Metric is quiet.
10. As an Owner, I want a limit on Alerts per person and per day, so that one enthusiastic person cannot flood Slack or the outbox.
11. As an Owner or a Workflow owner, I want a step in a Workflow that tells a named team when a Metric reaches a level, so that team-wide Alerts are a choice made in one place, not 20 personal ones.
12. As someone using an assistant, I want to say "alert me when churn goes above 3 %" and have it done after I confirm, so that I need not find the form.

## Implementation Decisions

### Words

- **Alert** is new (glossary below). Challenged against the neighbours:
  - **Escalation** is a Workflow step that acts on a missing value: it asks the Stand-in or tells the Metric Owner, as the Workflow's owner decided. Its _Avoid_ list names "Alert"; it now says "Warning" and points here. An Alert is a person's own wish and asks nobody for anything. "Not in by its Due Date" overlaps with Escalation on the day and differs in who is told and why: Escalation tells people responsible for the value, an Alert tells a person who merely wants to know. They may both fire for the same period.
  - **Unusual Value** is a value that needs Approval. Its check and an Alert's "changes more than" use the same change (the exact one of spec 0022), but the Alert has its own share, set by the person, and never changes a value's status, never sends it to Approval and never touches the Workflow.
  - **Prompt** asks a Submitter for a value; an answer to it is recorded. An Alert is never answerable: nothing said back to an Alert message is read as a value or anything else (below).
  - **Delivery** and **Delivery Preference** stay as they are: an Alert's message is one Delivery, in the Outbox.
- **Words in the condition:** "level" or "value", never "threshold" (an _Avoid_ word of Target Range). "Share of target" is Attainment's percentage, so it follows the Metric's Polarity and the Workspace's (or the Metric's) Attainment method.

### Who may set one, and for what

- **Who:** a person with a sign-in who may see the Metric: Members and Guests, by the same check as everything else (`visibleMetricIds`, a Share, a Group). Not Contacts, Feeds, View Link visitors or the demo. An assistant or program sets one with an Access Key, for the key's creator only.
- **Own only:** an Alert belongs to its person. Nobody sets one for another person: not an Owner, not an Admin, not the Metric Owner. Reaching a person with a message they never asked for is what Prompts, Escalations and the Tell step (below) are for, each owned by someone who answers for it.
- **Which Metrics:** any Metric the person sees, including a Derived Metric. Not an Archived Metric: archiving pauses its Alerts, bringing it back resumes them, with no message for the time in between.
- **The kinds need what they need:** "share of target" needs a Target with an Attainment percentage (not a target at or below zero, spec 0022's rule); the editor says so instead of offering it. If the target is later removed, the Alert is paused and says "no target now". "Not in by its Due Date" needs a Workflow, which gives the Due Date. Per-period targets (a Target Series) are used per period.
- **One Alert is one Metric, one condition, one way of delivery.** A person may hold several on a Metric.

### When an Alert is checked

- **On every value that counts:** after a value is recorded in the core's one submit path (`onValue`, whatever the Source: form, email, Slack, Telegram, API, Feed, MCP), after an Approval completes it, after a Correction is accepted, and after a Derived Metric's value is recomputed from its inputs. Never on a read.
- **Only the latest period:** an Alert looks at the Metric's latest period that has a value. A value for an older period does not fire it, so late values and Corrections to history are quiet.
- **Which values count (recommendation, an option per Alert):** only **published or approved** values. A value waiting for Approval, or a proposal on a Lock, is not seen by an Alert until it is approved; then it is checked as if it had just arrived. Each Alert has one option, **Include values not approved yet**, off by default, for the person who wants to hear about the Unusual Value that is waiting. Its message then says "not approved yet". Reason: Unusual Values are exactly the values that move across a level, and telling a team about a number its Approver may send back is how rumours start; the person who wants the first look can have it.
- **The check on the day after the Due Date:** the Workflow engine's daily run (`runWorkflows`), where it decides Escalations. It fires "Not in by its Due Date" once per period. A value arriving later does not retract anything.
- **Exact and the same maths:** a new pure module `alert-rules.ts` reads values as text and compares them exactly (spec 0022), taking Attainment from `attainment.ts` and the change from `exact.ts`. It is a calculation module of the catalogue (`docs/reference/calculations.md` gets rows), with reference tests written apart from the code. The edges: "reaches" is at or above, "falls below" is strictly below, "changes more than" is strictly more, a change from 0 follows the Unusual Value rule (any change away from 0 is more than any share), no value or no percentage is false.

### Firing: once per crossing

- **State:** each Alert holds `state` (`armed` or `fired`), `fired_period` and `fired_at`. A check that finds the condition true while `armed` sends one message and sets `fired`. A check that finds it false sets `armed` again, silently. A check that finds it true while `fired` does nothing. So a value that stays above stays quiet, and the person hears again only after it has fallen back.
- **Per period for two kinds:** "changes more than" and "not in by its Due Date" belong to a period, not to a level. They fire at most once per period and re-arm when a new period becomes the latest.
- **Claimed before sent:** the state change is made in one statement (`update ... where state = 'armed'`), and only the call that changed a row writes the Delivery, so two values arriving at once send one message, as a Workflow's day is claimed.
- **A Correction** to the latest period is checked like a new value: if it makes the condition true for an armed Alert, it fires; if it makes it false, the Alert is armed again and no retraction is sent. A Correction to an older period does nothing.
- **An Import is silent** (recommendation). Values recorded as an Import (a Feed's first history, a paste chosen as history) fire nothing. Afterwards the Alert is brought up to date without a message: the latest period's condition decides whether it is `armed` or `fired`, so the first real value after an Import behaves as it should. Reason: an Import is not a happening, and a Feed catching up should not send 700 messages. The Unusual Value check skips Imports for the same reason.
- **A paste** (spec 0026) that is not chosen as history records ordinary values. Alerts look at the latest period only, so a paste of five months fires at most once per Alert, for the latest.
- **A Lock** changes nothing: a locked period takes no values, and a proposal waits for Approval as above.

### Delivery

- **Through the Delivery Preference:** an Alert's message is a **Delivery** of the new kind `alert`, sent through the person's Connector by the same path as `deliverNotice` (so the same escaping of names on Slack, the same unsubscribe on email, the same queue). A person may pick one way for one Alert: "my usual way", email, Slack or Telegram, only those that reach them.
- **Never answerable:** an Alert Delivery has no reference (`ZIF-…`) and no reply path. A reply to an email, a Slack message or a Telegram message about an Alert is dropped with "Alerts cannot be answered; open the Metric", never read as a value, and never turned into a Thread. A test holds this, because replying "42" to a Prompt records a value.
- **Only to the person,** never to a channel or a Group. A channel is not a person and may hold people who do not see the Metric.
- **In the app:** the Metric's page shows **Alert me…** and the person's own Alerts on it, with state and when it last fired. Your settings has **Alerts**, the list of all of the person's Alerts that they can still see, with the same facts, switches to pause and delete. The Outbox shows the Deliveries as for any other.
- **No bell, no inbox of its own.** The Delivery is the record. (An inbox is a different feature and not asked for.)

### What an Alert message says

- **One short message:** "Sales reached 82 % of its target: 41,000 of 50,000 for October 2026. Open Sales: <link>". By kind: "…fell below 10,000: 8,400 for week of 9 Nov 2026"; "…changed more than 20 %: up 27 % on September 2026"; "No value yet for Sales, October 2026. It was due on 4 November. Open Sales: <link>". A value not yet approved says so.
- **Only that Metric,** its name, its period, its value, target and change as the Metric's page shows them, the same number style. No Breakdown, no comment, no name of the submitter, no value of any other Metric.
- **Checked again at the moment of sending:** the core asks whether the person may still see the Metric when the Delivery is made (not when the Alert was set), so a message that leaves is always one the person could have opened. This is the rule everywhere (AGENTS.md rule 3), said in a comment at the Delivery.
- **The link** goes to the Metric's page, where the sign-in applies. A link is never a View Link and never signs anyone in.

### Visibility: when a person loses sight

- **Stops silently:** when the person no longer sees the Metric (a Share removed, a Group left, the Metric made private, the person removed or turned into a Contact), the check skips the Alert and sends nothing, with no message saying why. The Alert is paused with the reason `no_access`.
- **Not shown:** the list in Your settings does not show a paused Alert whose Metric the person cannot see, since the name would show it still exists. If sight returns, the Alert resumes by being brought up to date silently, as after an Import.
- **Kept, then removed:** such an Alert is removed after 180 days of no access, and at once when the person leaves the Workspace or is deleted. The Audit Log does not record Alerts: they hold no change of who may see what (the event list stays as it is).
- **The mutating paths** (a Share removed, a role changed) need no change: the check at send time is the guard, and the pause is a bookkeeping state set by the next check.

### Limits

Per person and per Workspace, against spam; constants in one file (`alert-limits.ts`), numbers to be tuned:

- **20 Alerts per person per Workspace,** at most **5 on one Metric** (one Alert for each kind and delivery way is plenty).
- **500 Alerts per Workspace** in all.
- **20 Alert messages per person per day,** counted in the Outbox. When the 20th is sent, one last message says "More Alerts fired today; open the app", and the rest wait in the list as "fired" without Deliveries. That day's count and the note are per person, not per Alert.
- **2,000 Alert messages per Workspace per day,** after which Alerts fire into the list only and Owners and Admins see one note on the Workspace's Alerts overview (counts only, no one's list).
- **API and MCP** creation counts against the same limits, plus the API's rate limit; the MCP tools say the refusal in words.
- These are abuse safeguards like spec 0029's values per day: the same at every Size, never a price.

### Team Alerts: a Workflow step, not Alerts for others

- **Recommendation:** Owners and Admins cannot set personal Alerts for others. For a team there is a new Workflow step **Tell**: "when a value reaches 80 % of target / falls below 10,000 / changes more than 20 %, tell Ana, Ben and the Finance Group". It is set by the Workflow's owner, so it has an owner who answers for it, runs for every Metric of that Workflow, and is visible in the Workflow like Remind, Escalate, Check and Approve.
- **Why a step and not "Alert for others":** an Alert for others is a message to a person who did not ask, with a rule that changes under them, from someone who can still be told "stop". A Workflow's step already is that, with an owner, a place in the editor, and its changes in Versions.
- **Name:** **Tell**, not "Notify": "Notification" is an _Avoid_ word of Delivery, and Escalate's own words are "tell the metric owner". The step has the same four conditions minus "not in by its Due Date" (that is Escalate's).
- **Who is told:** people and Groups, expanded when it fires, each checked for sight of the Metric at that moment; those who cannot see it are skipped silently, and the editor lists beforehand "Cora cannot see Sales and will not be told". A Group is expanded to its people for the Delivery: nothing goes to a channel.
- **Firing:** once per crossing per Metric and period, the same state rule, claimed per step, Metric and period. It looks at published or approved values only (no option here: a team message about a value that may be sent back is the rumour the option warns about). Imports are silent.
- **Limits:** a Workflow holds at most 3 Tell steps, each tells at most 20 people.
- **A recipient** may say "stop telling me": one switch in Your settings per Workflow, like the Prompt unsubscribe, so a Tell step is never an unstoppable feed.
- This is the last ticket and may wait: personal Alerts stand on their own.

### Access: API, MCP, Starter, demo

- **API:** `GET /api/v1/alerts` (the key creator's own, those they can still see), `POST /api/v1/alerts`, `PATCH` and `DELETE /api/v1/alerts/{id}`. The body is checked on the server (kind, number as text or finite, a share between 1 and 1,000, the option, the way of delivery), by the same core functions as the app (`createAlert(actor, …)`, Actor first; the core checks sight of the Metric and the limits).
- **Scope:** a new scope **Manage alerts** (`alerts:write`; reading one's own needs `metrics:read` and the same key). Separate from "Submit values" because an Alert sends messages, and from "Change metrics" because it changes no Metric. An assistant with a read-only key cannot set one.
- **MCP tools:** `list_alerts`, `create_alert`, `update_alert` (pause, resume, change), `delete_alert`; each says the refusal's words (limit, no sight, kind not possible). `get_metric` does not list Alerts.
- **Starter:** `alert_me` (argument `text`, at most 1,000 characters, optional like the others): "Match each part to a Metric and a condition, confirm the list with the user, then create the Alerts and report what was created or refused". Needs Manage alerts for anything beyond reading.
- **Demo:** the demo is read-only (spec 0029), so nobody sets an Alert there. The demo's seed holds one example Alert and its fired state for one made-up person, so the Alerts page shows what it looks like. Nothing is sent from the demo.

### Sealed and audited

- **Workspace Keys (spec 0028):** an Alert's numbers (the level, the share) and message words are sealed with the Workspace Key as other values and the Outbox are, in the same ticket that adds the table; a dump holds nothing readable.
- **Audit Log:** Alerts are personal and hold no change of who may see what, so they are not in it. Their Deliveries are in the Outbox.
- **Outbox visibility:** the ticket checks who may read an Alert Delivery in the Outbox: only its recipient. It holds a value.

## Testing Decisions

- **The rules** as pure tables with reference tests (spec 0022): each kind at, just under and just over its edge; Polarity both ways; both Attainment methods; a target at or below zero; a change from 0; exact decimals (0.1 + 0.2 style inputs); "not in" across weekends and the Due Date.
- **Once per crossing:** above, above, below, above sends two messages; two values at once send one; a Correction up fires and a Correction down re-arms silently; an older period fires nothing; per-period kinds re-arm on the next period.
- **Approval and Imports:** an unapproved value fires nothing by default and fires with the option; approving it fires once; an Import fires nothing and the next value behaves; a pasted history fires at most once.
- **Visibility, the main test:** a person removed from a Share, from a Group, or the Metric made private gets no message, nothing in their list, and no message about why; sight returning resumes; sight lost between the check and the send sends nothing. A Delivery never holds another Metric's value or a Breakdown.
- **Never answerable:** a reply "42" on each Connector (email, Slack, Telegram) records nothing and makes no Thread.
- **Limits:** the 21st Alert, the 6th on a Metric, the 501st in a Workspace are refused with words; the 21st message of a day becomes the one note; parallel creations under the limit do not pass it.
- **Derived Metrics and the Workflow day:** a Derived Metric's Alert fires when an input changes it; "not in" fires once on the day after the Due Date and is claimed once when the job is called twice.
- **API and MCP:** each refusal; a key without Manage alerts; a key sees and changes only its creator's Alerts; the Starter's text holds its arguments as quoted text.
- **The Tell step:** the same rules for a team; skipped recipients without sight; nothing for the demo.
- The core against the database (`*.db.test.ts`), nothing inside it mocked, as every spec does. Tried in the running app: set one, record a value, read the message in the Outbox.

## Out of Scope

- Alerts for others, personal ones set by an Owner, Admin or Metric Owner (the Tell step covers teams).
- Messages to a Slack channel, a webhook or any address that is not a person.
- Alerts on Dashboards, Findings, Analyses or Comparisons, on Breakdown rows, and on several Metrics at once (a formula is a Derived Metric).
- Anomaly detection and forecasts ("tell me if it looks odd"); that is not a level a person can read.
- A bell, an inbox or an unread count in the app.
- Digests of Alerts (one message a day or a week); a later choice.
- Snoozing for a time (pausing is enough).
- Paid features and `ee/`.

## Open Questions

1. **Does an Alert see values not yet approved?** Recommendation: no by default, and an option per Alert ("Include values not approved yet"); the Tell step never does. Decided here, but it is the one the owner is most likely to change.
2. **Is "not in by its Due Date" an Alert at all, given Escalation?** Recommendation: yes, because it tells a person who is not responsible and asks nobody; it needs a Workflow's Due Date and says so. The alternative is to leave it to Escalation and let a Workflow owner add the watcher as "tell the Metric Owner"; that makes a watcher a responsible person, which is the wrong direction.
3. **Imports silent.** Recommendation: yes, always. The alternative, an option "also for Imports", invites the storm it avoids.
4. **Who may use Tell, and may it tell a Group?** Recommendation: the Workflow's owner, people and Groups, with the sight check per person. The question for the owner is whether a Group message is wanted at all in the first version.
5. **The limits' numbers** (20, 5, 500, 20 a day, 2,000 a day): recommendation, as above; they are one file to change once real use shows more.
6. **Name of the step: Tell or Notify?** Recommendation: Tell (see Words).
7. **Does a paused Alert for a lost Metric stay 180 days?** Recommendation: yes, silent and hidden; a person returned to a Share expects their Alerts back.

## Tickets

1. Words and rules: the glossary (Alert; Escalation's _Avoid_ list), `alert-rules.ts` with its catalogue rows and reference tests. Not blocked.
2. Alerts in the core: the table (sealed), the operations with the Actor first and the sight check, the limits, db tests; no firing yet. Blocked by 1 and spec 0028's sealing.
3. Firing: the checks in the submit path, Approval, Correction and Derived recomputation, the daily "not in" in the Workflow run, state and claim, the Delivery kind `alert` with its message, silent Imports, no replies. Blocked by 2.
4. In the app: **Alert me…** on the Metric page, **Alerts** in Your settings, the user guide chapters (Metrics, Your settings), a release note. Blocked by 3.
5. API and MCP: the endpoints, the scope, the four tools, the Starter `alert_me`; the demo's example Alert. Blocked by 3.
6. The Workflow step **Tell**: the editor, the engine, the limits, "stop telling me"; the user guide chapter 11. Blocked by 3.
7. Docs and a security review of the whole spec (visibility at send time, no replies, limits, sealing). Blocked by 4, 5 and 6.
