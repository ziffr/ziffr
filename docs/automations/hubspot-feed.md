# HubSpot to Ziffr (Automation Template for a Feed)

One n8n workflow that asks HubSpot once a month how many deals were won and how many contacts were created, and sends the two counts to Ziffr as values of your Metrics. It is an [Automation Template](../../GLOSSARY.md): a file in this repository that you import into your own n8n. Ziffr never runs it and never holds your HubSpot login; the Feed Key it sends with lives in an n8n credential. It sends through a [Feed](../guides/feeds.md), the same way as a program written with `@ziffr/feed-kit`.

**Tried against a real n8n and HubSpot:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`hubspot-feed.json`](hubspot-feed.json) | HubSpot to Ziffr | On the 1st of every month at 9 (UTC): asks Ziffr which months are filled, then HubSpot's search for the totals (read only), sends the two figures for the month that has just ended to the Feed endpoint, and fails the run if Ziffr refuses one. |

## The figures

Both are for the **month that has just ended** (the run on 1 November sends the values for 1 October), so each Metric gets one value a month. A month that already has a value is not sent again, so a rerun or a manual run on another day never overwrites, adds to or doubles it, whatever the Metric's Submission Rule. Make the Metrics **monthly**; a Metric of another period refuses the value.

| Figure | How it is counted |
|---|---|
| Deals won | Deals that are closed won (`hs_is_closed_won`) and whose close date is in that month. |
| New contacts | Contacts whose create date is in that month. |

Only HubSpot's own total comes back: the template asks for one record (only its id) and reads the count, so no name, email or amount is read into n8n, and nothing but the count is sent to Ziffr. The month is in UTC.

## Set up

1. In HubSpot, **Settings → Integrations → Private Apps → Create a private app**, with the scopes **`crm.objects.deals.read`** and **`crm.objects.contacts.read`** and no other. Copy its access token.
2. In Ziffr, **Settings → Feeds**: make a Feed, and make a Feed Key for it with an end date within a year. Copy the key (shown once).
3. Make the Metrics (monthly, any names), and on each open **Who submits** and add the Feed.
4. In n8n, import `hubspot-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address already in it (**Fill from n8n** on a Metric or after **Set up from a Pack**).
5. Open the **Settings** node: your Ziffr address and the slug of each Metric (the slug is in the Metric's address; leave a figure's slug empty to skip it).
6. Add the credential **HubSpot App Token** (the private app's token) in n8n and choose it in both **Count** nodes.
7. Add a credential of the type **Header Auth** named `Ziffr Feed Key`: name `Authorization`, value `Bearer ` followed by your key. Choose it in **What is filled** and **Send to Ziffr**. Keep the key in the credential, never in the workflow, so that you can share the workflow.
8. Press **Execute workflow** once. In Ziffr the Metrics show last month's values, from "Feed". Then activate the workflow.

## Limits

- **Two figures only.** For the value of deals, a pipeline or a team's own numbers, change the **Count** nodes' filters in n8n, or use a sheet.
- **Past months are not filled.** Use the assistant text on a Metric ("Fill past periods with my assistant…") for the history.
- **A refused value fails the run**, so n8n shows it as failed. Last month has no value yet, so it is an Import: it is recorded without the Unusual Value check. Look at the first run's numbers yourself.
- **The private app can only read deals and contacts**, and its token stays in n8n. The Feed Key can write values for its Feed's Metrics and nothing else. Both are secrets: if one leaks, revoke it (HubSpot: the app's token; Ziffr: **Settings → Feeds**).
- **HubSpot can change.** If its search API asks for other settings, import the workflow again from this repository or fix the node; a template that stops working is fixed by a pull request.
