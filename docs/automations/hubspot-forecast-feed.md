# HubSpot sales forecast to Ziffr (Automation Template for a Feed)

One n8n workflow that adds up your HubSpot deals every Monday and sends the week's **Closed this quarter** and **Pipeline value**, and if you like **Commit** and **Best case**, to Ziffr through a [Feed](../guides/feeds.md). It is an [Automation Template](../../GLOSSARY.md): a file you import into your own n8n. Read [what the CRM forecast templates have in common](crm-forecast-feeds.md) for the figures, the week, reruns and salespeople.

**Tried against a real n8n and HubSpot:** not yet — owner to try. The requests are written after HubSpot's API documentation (2026-09), and the workflow's code is tested against made-up answers.

| File | Direction | What it does |
|---|---|---|
| [`hubspot-forecast-feed.json`](hubspot-forecast-feed.json) | HubSpot to Ziffr | Every Monday at 12 (UTC): asks Ziffr which weeks are filled, searches the quarter's won and open deals (read only, every page), adds them up per team and owner, sends the figures to the Feed endpoint, and fails the run if Ziffr refuses one. |

## How HubSpot is read

| What | How |
|---|---|
| Won | Deals with `hs_is_closed_won` and a close date from the quarter's first day to the week's end. |
| Open | Deals that are not closed (`hs_is_closed` is false) with a close date in the quarter. |
| Amount | `amount_in_home_currency`: the amount in your company currency, converted by HubSpot. A deal in another currency without it stops the run. |
| Owner | `hubspot_owner_id`. |
| Category | `hs_manual_forecast_category`: `COMMIT` is commit; `BEST_CASE` and `MOST_LIKELY` are added for best case. |

HubSpot keeps a close date with a time of day. The template counts it in your `timeZone`. If deals on the first or last day of a quarter fall on the wrong side, compare with HubSpot and set `timeZone` to the zone your HubSpot dates are stored in, such as `UTC`.

Forecast categories can differ between accounts. When commit or best case is asked for, the template first reads which categories yours has and stops if `COMMIT` or `BEST_CASE` is not one, listing those it found. Change `COMMIT` and `UPSIDE` at the top of the node **Figures** to match.

## Set up

1. In HubSpot, make a **service key** (or a private app, which HubSpot now calls a legacy app) with the one scope **`crm.objects.deals.read`**. Copy its token.
2. Do [the part in Ziffr](crm-forecast-feeds.md#set-up-the-part-in-ziffr).
3. In n8n, import `hubspot-forecast-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address in it (**Fill from n8n**).
4. **Settings** node: your Ziffr address, your time zone, and the slugs of the Metrics. After setting up the Pack they are usually `closed-this-quarter`, `pipeline-value`, `commit` and `best-case`; check each Metric's address. Leave commit and best case as they are to skip them.
5. Add the credential for the token in n8n (**HubSpot App Token**; newer n8n versions call it **HubSpot Service Key**) and choose it in **Read won deals**, **Read open deals** and **Read forecast categories**.
6. For salespeople with their own Metrics, fill in the **Owners** node. The id is HubSpot's owner id. A first run lists the ids that have deals in the output of **Figures**; HubSpot's Owners API says who each one is.

## Limits

- A search hands out at most **10,000 deals**. With more won or open deals in a quarter, the run fails and sends nothing.
- HubSpot's search can lag a few moments behind a change.
- The token can read every deal of the account. It stays in n8n; revoke it in HubSpot if it leaks.
