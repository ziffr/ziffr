# CRM sales forecast templates: what the three have in common

Three [Automation Templates](../../GLOSSARY.md) send the weekly figures of the **Sales forecast** Pack from a CRM into Ziffr through a [Feed](../guides/feeds.md): [HubSpot](hubspot-forecast-feed.md), [Salesforce](salesforce-forecast-feed.md) and [Pipedrive](pipedrive-forecast-feed.md). You import one into your own n8n. Ziffr never runs it and never holds your CRM login. This page says what they send and when; each CRM's page says how to set it up.

## The figures

| Setting | Figure | What is added up |
|---|---|---|
| `closedMetric` | Closed this quarter | Deals won since the quarter began, up to the end of the week. |
| `pipelineMetric` | Pipeline value | Open deals that close in this quarter, those in the commit included, those won not. |
| `commitMetric` (optional) | Commit | Closed this quarter, plus the open deals in the forecast category **Commit**. HubSpot and Salesforce only. |
| `bestCaseMetric` (optional) | Best case | Closed this quarter, plus the open deals in **Commit**, **Best case** and **Most likely**. HubSpot and Salesforce only. |

Commit and best case are off until you put a slug in their settings. In the Pack, **Commit** is the call each salesperson makes. A sum from the CRM replaces that call with what the deals' categories say, so send it only if that is how your team calls its quarter. In the Pack, the team's figures are [Totals](../user-guide/10-metrics.md#adding-up-metrics-a-total), which take no values: leave the team's settings empty and list each salesperson under [Owners](#each-salespersons-own-figures). The calculated Metrics need nothing.

Only a Metric's slug, the week and a number are sent to Ziffr: no deal, company, contact, name or email. The CRM is only read. The figures are worked out from amounts, owner ids and, to choose what counts, each deal's state, dates, currency and forecast category. Ids you put in the **Owners** node stay in n8n. **What n8n receives from the CRM can be more than the figures need:**

| CRM | What reaches your n8n |
|---|---|
| HubSpot | For each won and open deal of the quarter: its amounts, currency, owner id and forecast category, with HubSpot's record id and its creation and change dates. No name is asked for. |
| Salesforce | Totals and counts for each owner id and forecast category. No single opportunity. |
| Pipedrive | **Whole deals**, since its list cannot be cut down: title, the ids of the person and organisation, custom fields and the rest. They may hold personal data. |

n8n keeps what a run read: see [What n8n keeps](#what-n8n-keeps).

## Week, quarter and time zone

- **The week** is the one that ended last, Monday to Sunday, in the time zone you put in the setting `timeZone` (such as `Europe/Berlin`). Its value is filed under that week's Monday.
- **The quarter** is the one the week starts in, counted from the month your Workspace's year starts in (Ziffr tells the template). A week that spans two quarters belongs to the first: Closed this quarter then stops at the quarter's last day.
- **When it runs:** every Monday at 12:00 UTC, which is Monday or early Tuesday everywhere. You may move it earlier on Monday, to read the pipeline closer to the week's end. It must still be after 00:00 UTC on Monday, or the run stops and says that Ziffr still counts the week as running. The schedule is read in the workflow's time zone in n8n (UTC as shipped).
- **Pipeline, commit and best case are what the CRM says at the moment of the run.** A CRM does not tell what its pipeline was last Sunday. So they are sent only when the run is on a Monday or Tuesday. A run later in the week sends Closed this quarter only and says why. A missed week stays empty: type it in if you know it.
- Deals dated before this quarter that are still open are not in the pipeline. Move their close date in the CRM, or they count nowhere.

## No value is not 0

A 0 is sent when the CRM showed deals and a figure's own deals add up to nothing, such as nothing won yet in a new quarter. When the CRM showed **no deal at all**, for the team or for one owner of the table, nothing is sent for them. That is more often a missing permission or a wrong id than a real nothing. The run's output says so, and a run with nothing to send at all is shown as failed.

A deal without an amount counts as 0, and the output says how many there were.

## Reruns

The template asks Ziffr which weeks already have a value and never sends such a week again, whether a person, an earlier run or another system sent it. So a rerun overwrites nothing, adds nothing and doubles nothing. To change a figure that is in, including one sent back at Approval, a person who submits the Metric records it (**Record a value**) and picks the week.

## Each salesperson's own figures

The node **Owners** holds one table, empty as shipped, in which a line maps a CRM owner to that person's Metrics:

```js
const OWNERS = [
  { owner: '1234567', closed: 'closed-this-quarter-ana', pipeline: 'pipeline-value-ana', commit: 'commit-ana' },
  { owner: '7654321', closed: 'closed-this-quarter-ben', pipeline: 'pipeline-value-ben' },
];
```

Use the slugs of your own Metrics (the last part of a Metric's address), such as those the Pack made for each salesperson. A figure you leave out is not sent. Leave a team slug empty if your team figure is added up from the salespeople's Metrics, as in the Pack: that sum counts only the salespeople with Metrics, so deals of owners with no line are not in it, and the run's output lists their ids. A team slug you do fill adds up **all** deals.

One Feed fills at most 100 Metrics with these templates: with four figures each, the team and 24 salespeople. For more, import the template a second time with a second Feed.

## Set up, the part in Ziffr

1. Install and set up the **Sales forecast** Pack, with a line for each salesperson, or make the Metrics yourself. They must be **weekly**, and their unit should be the currency the template adds up.
2. **Settings → Feeds**: make a Feed, and a Feed Key with an end date within a year. Copy the key (shown once).
3. On each Metric the template fills, add the Feed under **Who submits**. A person who stays a Submitter is still asked on Monday while the week has no value: take them off to stop that, and keep (or add) whoever should be able to correct a figure. **Fill from n8n** on a Metric makes the Feed a Submitter, does step 2 if you like, and hands you the file with your Ziffr address in it.
4. In n8n, add a credential of the type **Header Auth** named `Ziffr Feed Key`: name `Authorization`, value `Bearer ` followed by your key. Choose it in **What is filled** and **Send to Ziffr**. Keep the key in the credential, never in the workflow. Where your n8n offers **Allowed HTTP Request Domains** on the credential, choose **Specific Domains** and enter your Ziffr's host name only.

Then follow the CRM's page, press **Execute workflow** once on a Monday or Tuesday, compare the figures with your CRM, and activate the workflow.

## What n8n keeps

By default n8n may save each run with everything its nodes received, and whoever may open the workflow can read it there. Decide this before you activate the workflow, above all for Pipedrive:

- In the workflow's **Settings**, set **Save successful production executions** and **Save manual executions** to not save. Set **Save failed production executions** the same way if you can do without the details of a failed run.
- Or have n8n delete old runs after a few days (self-hosted n8n: `EXECUTIONS_DATA_PRUNE` and `EXECUTIONS_DATA_MAX_AGE`), and delete the runs you made while trying it.

## What happens in Ziffr

- A Feed is never asked for a value. If the week's value is still missing after the Due Date, the Pack's Workflow tells the Metric's owner and names the Feed.
- The first value for the week that just ended is an [Import](../../GLOSSARY.md): it is recorded **without the Unusual Value check**, so the Pack's 25 % mark does not apply to it.
- Under a Workflow whose Approver approves **every value**, as in the Pack, it still waits for that approval.
- A locked week takes no value: it goes to the Metric's owner as a proposed Correction.
- A value Ziffr refuses fails the run, so n8n shows it.

## Limits of all three

- **Read only.** The templates never write to the CRM.
- **Past weeks are not filled.** For history, type or [paste](../user-guide/10-metrics.md#paste-values-from-a-spreadsheet) it.
- **All pipelines count together.** To count one, add a filter to the read nodes in n8n.
- **Look at the first run's figures yourself** and compare them with the CRM's own report. A permission that hides some deals gives a sum that is too low, and nothing can tell.
- **CRMs change their APIs.** If a read is refused, import the template again from this repository or report it.
