<!-- part: Understanding Ziffr -->
# How your numbers are kept

What replaces what, what stays, and what you can undo.

## The four things

| Thing | What it does | What it replaces | Who |
| --- | --- | --- | --- |
| **Value** | A Metric's number for one period. | A second value follows the **Submission Rule**: it replaces the first, adds up with it, is kept beside it, or is refused. A number that is replaced, added to or corrected stays as a **Superseded Value**. With both kept, charts show the latest. | Submitters send values, as does whoever stands in or fills in for them. |
| **Lock** | Stops one Metric's period from taking values. | Nothing. A late value waits as a proposed **Correction**. | The **Metric Owner** locks and unlocks. A **Workflow** can lock too. |
| **Snapshot** | Keeps what a dashboard showed for a week, month, quarter, half-year or year that is over. | Nothing. One per dashboard and period. A later correction does not change it; it lists the difference. | Taken by the dashboard's owner or an Editor, who must see all its Metrics. Never by a Guest. |
| **Version** | The history of how something was set up, such as a Metric's description or a dashboard and its widgets. | Nothing: restoring one adds a new Version. It never changes a stored value. | Whoever may change the thing. For a Metric, only the Metric Owner. |

Two exceptions to the Submission Rule: your own value replaces, under any rule, one that someone else [filled in](10-metrics.md#filling-in-a-value-for-someone) for you, and a form link answering an earlier period only fills a period that is still empty.

## One week, step by step

Ana sends the weekly Metric "Orders". Its rule is **Overwrite with the newer value**. Ben is its Metric Owner and owns the dashboard "Weekly numbers". The Metric's Workflow publishes values without locking them. No value here is unusual.

| When | What happens | What you see |
| --- | --- | --- |
| Monday | Ana records 40 for last week. | The Metric and the dashboard show 40. The Workflow box says "published". |
| Tuesday | Ana sends 42 for the same week. | Both show 42. On the [period's page](10-metrics.md#a-periods-page), **History** keeps 40, struck through. |
| Wednesday | Ben asks Ana about the number. In the Thread she proposes 43 as a Correction, and Ben accepts it. | 42 stays everywhere until he accepts. Then the number is 43, with 42 struck through beside it on the period's page. The Workflow checks 43 and publishes it. |
| Thursday | Ben presses **Lock** in the Metric's Workflow box. | The box says "published and locked". |
| Friday | Ben takes a week Snapshot of the dashboard. | The Snapshot shows 43. It is a draft until Ben or an Editor shows it. |
| Saturday | Ana sends 45 for last week. | Nothing changes: 43 stays, locked. Ana is told that 45 went to Ben, who gets **Accept** and **Decline**. |
| Saturday | Ben accepts. | The Metric and the dashboard show 45, published and no longer locked. The Snapshot still shows 43 and says it is now 45. |
| After that | Ben locks the week again. | 45 is locked. |

On the period's page the struck-through number beside 45 is still 42, the one before the first Correction. **History** lists every step.

Keep in mind:

- A Correction is the new number, never an amount to add, also where the rule adds up or keeps both. A late "3 more" that you accept makes the number 3.
- An accepted Correction removes the Lock, unless the Workflow's Publish step locks the period again.
- On a Metric with no Workflow, a period that was locked and then corrected counts as not approved yet, and you cannot lock it again.
- Had Ben declined, 43 would have stayed, locked.

## What you can undo

| Action | Can it be undone? | Who |
| --- | --- | --- |
| Delete one value | There is no such action. Send it again if the rule allows, or correct it. | |
| Replace or correct a value | No button brings the earlier number back. Enter it again: send it where the rule overwrites, or propose it as a Correction. | The Metric Owner accepts Corrections, except for a value they filled in. In a [Self-check](11-workflows.md#checking-your-own-value) a submitter's correction applies at once. |
| Lock a period | Yes, **Unlock** with a reason. The Workflow box offers it only for the last period that has ended. | The Metric Owner |
| Show a Snapshot | No. It cannot become a draft again. | The dashboard's owner and Editors |
| Delete a Snapshot | No: its numbers, words and Versions are gone. You can take the period again by hand, from the dashboard and values as they are then. It is not taken by itself again. | Only the dashboard's owner |
| Restore a Version | Yes, restore the one before. | As in the first table |
| [Archive a Metric](10-metrics.md#archiving-a-metric) | Yes, bring it back. Values and history stay. Questions and tasks that archiving closed stay closed. | The Metric Owner, Owners and Admins |
| [Delete a Metric](10-metrics.md#deleting-a-metric) | No: values and history are gone. In the app you download its record first. Earlier Snapshots keep its numbers for those who could see it. | Only the Metric Owner |
| [**Retention**](10-metrics.md#retention) deletes older values, or condenses them into one **Condensed Value** per longer period | Only before it starts: a change that removes more waits 7 days, and you can cancel it. Afterwards, no. A Lock does not protect a period. Snapshots keep their numbers. | The Metric Owner, Owners and Admins |

## Closing the books

1. **Lock the period.** The Metric Owner locks one Metric's period. A Workflow's owner can lock the last period of all its Metrics with **Close the period**, except where a value is missing, waits for Approval or was sent back. A Publish step can lock each value as it is published.
2. **Take the Snapshot.** It is your report: write what happened, then show it.

The dashboard's owner can have it take [Snapshots by itself](12-dashboards.md#automatic-snapshots): as soon as every Metric on it is locked for the period, or after the days of waiting they set, **whichever comes first**. So an automatic Snapshot can hold periods that are not locked. It stays a draft. A Workflow can also [take, show and send one](12-dashboards.md#sent-by-a-workflow) once its period is finished.
