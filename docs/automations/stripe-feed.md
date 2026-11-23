# Stripe to Ziffr (Automation Template for a Feed)

One n8n workflow that reads your Stripe subscriptions once a month and sends three figures to Ziffr as values of your Metrics: **monthly recurring revenue**, **customers with a subscription** and **customers who cancelled**. It is an [Automation Template](../../GLOSSARY.md): a file in this repository that you import into your own n8n. Ziffr never runs it and never holds your Stripe key; the Feed Key it sends with lives in an n8n credential. It sends through a [Feed](../guides/feeds.md), the same way as a program written with `@ziffr/feed-kit`.

**Tried against a real n8n and Stripe:** not yet — owner to try.

| File | Direction | What it does |
|---|---|---|
| [`stripe-feed.json`](stripe-feed.json) | Stripe to Ziffr | On the 1st of every month at 9: reads the subscriptions (read only), works out the three figures for the month that has just ended, sends them to the Feed endpoint, and fails the run if Ziffr refuses one. |

## The figures

All three are for the **month that has just ended** (the run on 1 November sends the values for 1 October), so each Metric gets one value a month and a rerun changes nothing. Make the Metrics **monthly**; a Metric of another period refuses the value.

| Figure | How it is worked out |
|---|---|
| Monthly recurring revenue | Every `active` or `past_due` subscription's plain recurring prices: amount times quantity, brought to one month (a week is 52/12 of a month, a year is a twelfth), in the one currency you name, in whole units (euros, not cents). Discounts, coupons, tax and one-off charges are not counted. |
| Customers | The number of different customers with an `active` or `past_due` subscription. A trial is not yet a customer. |
| Customers who cancelled | Customers whose subscription was cancelled in that month and who have no subscription now. A customer who cancelled one plan and kept another is not counted. |

A price the template cannot add up is left out of the revenue, and the run's output says how many: tiered or volume prices (no single amount), metered prices, prices in another currency, prices without a fixed interval. Customers are still counted. For several currencies, import the workflow again for each and name another Metric.

## Set up

1. In Stripe, **Developers → API keys → Create restricted key**: give it **read** access to **Subscriptions** and nothing else. Never use a secret key with write access.
2. In Ziffr, **Settings → Feeds**: make a Feed, and make a Feed Key for it with an end date within a year. Copy the key (shown once).
3. Make the Metrics (monthly, any names), and on each open **Who submits** and add the Feed.
4. In n8n, import `stripe-feed.json` (**Workflows → Import from file**), or get it from Ziffr with your address already in it (**Fill from n8n** on a Metric or after **Set up from a Pack**).
5. Open the **Settings** node: your Ziffr address, the slug of each Metric (the slug is in the Metric's address; leave a figure's slug empty to skip it) and the currency, three letters such as `eur`.
6. Add the credential **Stripe API** (the restricted key) in n8n and choose it in both **Read** nodes.
7. Add a credential of the type **Header Auth** named `Ziffr Feed Key`: name `Authorization`, value `Bearer ` followed by your key. Choose it in **Send to Ziffr**. Keep the key in the credential, never in the workflow, so that you can share the workflow.
8. Press **Execute workflow** once: whatever the day, the values are for the last whole month. Then activate the workflow.

## Limits

- **It reads at most 5,000 current and 5,000 cancelled subscriptions.** If Stripe has more, the run fails and sends nothing, rather than send a number that is too low.
- **Past months are not filled.** Use the assistant text on a Metric ("Fill past periods with my assistant…") or a sheet for the history.
- **A refused value fails the run**, so n8n shows it as failed. A value that is unusual waits for Approval, as any value does.
- **The restricted key can only read subscriptions**, and it stays in n8n. The Feed Key can write values for its Feed's Metrics and nothing else. Both are secrets: if one leaks, revoke it (Stripe: the key; Ziffr: **Settings → Feeds**).
- **Only the three numbers leave Stripe's side.** No customer, email, id or amount of a single customer is sent to Ziffr.
- **Stripe can change.** If a newer API version asks for other settings, import the workflow again from this repository or fix the node; a template that stops working is fixed by a pull request.
