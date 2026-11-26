# Pipedrive sales forecast to Ziffr (Automation Template for a Feed)

One n8n workflow that adds up your Pipedrive deals every Monday and sends the week's **Closed this quarter** and **Pipeline value** to Ziffr through a [Feed](../guides/feeds.md). It is an [Automation Template](../../GLOSSARY.md): a file you import into your own n8n. Read [what the CRM forecast templates have in common](crm-forecast-feeds.md) for the figures, the week, reruns and salespeople.

**No commit and no best case:** Pipedrive's deals have no forecast category, so a person sends those, as the Pack expects.

**Tried against a real n8n and Pipedrive:** not yet — owner to try. The requests are written after Pipedrive's OpenAPI description of API v2, and the workflow's code is tested against made-up answers.

| File | Direction | What it does |
|---|---|---|
| [`pipedrive-forecast-feed.json`](pipedrive-forecast-feed.json) | Pipedrive to Ziffr | Every Monday at 12 (UTC): asks Ziffr which weeks are filled, lists won and open deals (read only, every page), adds them up per team and owner, sends the figures to the Feed endpoint, and fails the run if Ziffr refuses one. |

## How Pipedrive is read

| What | How |
|---|---|
| Won | Deals with the status `won` whose `won_time` (the moment they were marked won) falls between the quarter's first day and the week's end, in your time zone. Only deals changed since the quarter began are listed. |
| Open | All deals with the status `open`; those with an `expected_close_date` in the quarter count. Open deals without that date are not counted, and the output says how many. |
| Amount and currency | `value`. Pipedrive's list does not convert, so every counted deal must be in the currency of the setting `currency`. One deal in another currency stops the run, rather than send a sum that is too low or mixed. |
| Owner | `owner_id`. |
| Pages | 500 deals a page, up to 100 pages (50,000 deals) for each of the two lists. More stops the run. |

**n8n receives whole deals.** Pipedrive's list cannot be cut down to the fields the sums need: each deal comes with its title, the ids of its person and organisation, its custom fields and the rest, which may hold personal data. Only the totals are sent to Ziffr, but n8n can keep all of it in its saved runs: turn that off, or delete old runs, as [What n8n keeps](crm-forecast-feeds.md#what-n8n-keeps) says. Archived and deleted deals are not counted.

## Set up

1. In Pipedrive, take the **API token** of a user who **sees all deals** (Personal preferences → API). Pipedrive cannot limit a token to reading: it can do what its user can. Use a user with as few rights as will still see the deals. The workflow only sends `GET` requests.
2. Do [the part in Ziffr](crm-forecast-feeds.md#set-up-the-part-in-ziffr).
3. In n8n, import `pipedrive-forecast-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address in it (**Fill from n8n**).
4. **Settings** node: your Ziffr address, your deals' currency (such as `EUR`), your time zone, and the slugs of the Metrics (after setting up the Pack usually `closed-this-quarter` and `pipeline-value`).
5. Add a credential of the type **Header Auth** named `Pipedrive API Token`: name `x-api-token`, value the token. Choose it in **Read won deals** and **Read open deals**. Where your n8n offers **Allowed HTTP Request Domains** on the credential, choose **Specific Domains** and enter `api.pipedrive.com`.
6. For salespeople with their own Metrics, fill in the **Owners** node with their Pipedrive user ids. A first run lists the ids that have deals in the output of **Figures**.

## Limits

- **One currency.** For several, convert in the node **Figures** with your own rates, or send the figures another way.
- The token stays in n8n; make a new one in Pipedrive if it leaks.
