# Salesforce sales forecast to Ziffr (Automation Template for a Feed)

One n8n workflow that asks Salesforce for opportunity totals every Monday and sends the week's **Closed this quarter** and **Pipeline value**, and if you like **Commit** and **Best case**, to Ziffr through a [Feed](../guides/feeds.md). It is an [Automation Template](../../GLOSSARY.md): a file you import into your own n8n. Read [what the CRM forecast templates have in common](crm-forecast-feeds.md) for the figures, the week, reruns and salespeople.

**Tried against a real n8n and Salesforce:** not yet — owner to try. The queries are written for Salesforce's REST Query API (version 62.0), and the workflow's code is tested against made-up answers.

| File | Direction | What it does |
|---|---|---|
| [`salesforce-forecast-feed.json`](salesforce-forecast-feed.json) | Salesforce to Ziffr | Every Monday at 12 (UTC): asks Ziffr which weeks are filled, runs two grouped queries (read only), adds up the totals per team and owner, sends the figures to the Feed endpoint, and fails the run if Ziffr refuses one. |

## How Salesforce is read

Salesforce does the adding up: no opportunity and no name is read, only totals per owner and forecast category.

| What | How |
|---|---|
| Won | `SUM(Amount)` of opportunities with `IsWon = true` and `CloseDate` from the quarter's first day to the week's end, by `OwnerId`. |
| Open | `SUM(Amount)` of opportunities with `IsClosed = false` and `CloseDate` in the quarter, by `OwnerId` and `ForecastCategory`. |
| Category | `Forecast` (shown as Commit) is commit; `BestCase` and `MostLikely` are added for best case. A category the template does not know stops the run. |
| Currency | In an org with several currencies, Salesforce gives these totals in the org's default currency, converted at its rates. |
| Pages | None: a grouped query answers once, with at most 2,000 rows (several hundred owners). More stops the run. |

`CloseDate` is a date without a time, so your time zone decides only which week and quarter are meant.

## Set up

1. In Salesforce, use a **user of its own** for this that may **read all opportunities** (View All on Opportunity, and read on the fields Amount, Close Date, Stage and Owner) and may change nothing. The totals hold only what that user can see: one who sees only some opportunities gives sums that are too low.
2. Make a connected app (or external client app) for n8n, and in n8n a **Salesforce OAuth2 API** credential signed in as that user. n8n asks for full access in that credential; the user's permissions are what keeps it to reading.
3. Do [the part in Ziffr](crm-forecast-feeds.md#set-up-the-part-in-ziffr).
4. In n8n, import `salesforce-forecast-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address in it (**Fill from n8n**).
5. **Settings** node: your Ziffr address, your Salesforce address (`instanceUrl`, such as `https://yourcompany.my.salesforce.com`; only a `salesforce.com` address is taken, since the login is sent there), your time zone, and the slugs of the Metrics. Leave commit and best case as they are to skip them.
6. Choose the credential in **Read won totals** and **Read open totals**.
7. For salespeople with their own Metrics, fill in the **Owners** node with their User ids (starting `005`; the address of a user's page in Setup holds it).

## Limits

- Your org must have the **Forecast Category** field on opportunities, which Salesforce has as standard.
- The org's fiscal year setting is not read: quarters follow your Ziffr Workspace's year start. Set it to the same month.
- The login stays in n8n; revoke it in Salesforce if it leaks.
