# @ziffr/feed-kit

Write a [Ziffr](https://github.com/ziffr/ziffr) Feed: a program that brings values for some Metrics from another system (a CRM, a data warehouse, a help desk) into Ziffr on a schedule. You say how to fetch one period's value; the kit asks Ziffr which periods are current or still missing, fetches them, and records them. MIT licensed, Node 20 or later. Publish your Feed however you like: free, paid or closed.

## A first Feed

1. In Ziffr, an Owner or Admin opens Settings, Feeds, creates a Feed and a Feed Key for it, and copies the key (shown once).
2. On each Metric the Feed should fill, its owner opens Settings, "Who submits", and adds the Feed.
3. Write the Feed:

```sh skip="installs a package"
npm install @ziffr/feed-kit
```

```js skip="a Feed for a CRM that is not there"
// crm.feed.mjs
import { defineFeed } from "@ziffr/feed-kit";

export default defineFeed({
  name: "CRM",
  metrics: {
    // The Metric's slug, as Ziffr shows it in the Metric's address.
    "deals-won": {
      // period: the period's first day (YYYY-MM-DD); periodEnd: the day after its last; current: still running.
      fetch: async ({ period, periodEnd }) => {
        const res = await fetch(`https://crm.example.com/api/deals?won_from=${period}&won_to=${periodEnd}`, { headers: { authorization: `Bearer ${process.env.CRM_TOKEN}` } });
        const deals = await res.json();
        // A number, { value, breakdown: [{ label, value }] }, or null when there is no value yet.
        return { value: deals.length, breakdown: countBy(deals, "region") };
      },
    },
  },
});
```

4. Run it, from cron, a GitHub Action, a container or anywhere else:

```sh skip="needs a Feed Key and the CRM Feed above"
export ZIFFR_URL=https://ziffr.example.com ZIFFR_FEED_KEY=zk_...
npx ziffr-feed run crm.feed.mjs --dry-run       # shows what it would send
npx ziffr-feed run crm.feed.mjs --backfill 24   # also fills the 24 periods before this one where they are empty
```

## What a run does

- **It fetches the current period** of each Metric every time, since its value may still change, and **each earlier period that is still empty**, up to `--backfill N` periods back. Ziffr says which period is current, so the Feed fetches the periods Ziffr counts wherever it runs.
- **Quarterly and yearly Metrics** get one fetch per quarter or year, from its first day to the day after its last. Quarters and years start from the workspace's year start, which `GET /feed` names as `year_start_month`; `periodStart(day, period, yearStartMonth)` gives the period a day falls in.
- **It keeps no state.** The periods Ziffr already has are the state, so you can run it as often as you like.
- **It records nothing twice.** Each batch carries an idempotency key made from the Feed and its values, so a repeated run with the same values replays Ziffr's first answer.
- **Imports skip the Unusual Value check.** A value for a past period that had none is an Import: Ziffr records it without asking for Approval and marks it as imported. The current period is checked as usual.
- **One failure stops nothing else.** A fetch that throws is reported and the rest are sent. The command exits with 1 when a fetch failed or Ziffr refused a value, so your scheduler notices.
- **Your secrets stay with you.** Only values and Breakdowns go to Ziffr. Keep the other system's credentials in the environment where the Feed runs.

## From code

```ts skip="needs the CRM Feed above"
import { runFeed, summary } from "@ziffr/feed-kit";
import feed from "./crm.feed.mjs";

const report = await runFeed(feed, { backfill: 3, log: console.error });
console.log(summary(report)); // "CRM: sent 4 values: 1 recorded, 3 imported, 0 awaiting Approval, 0 locked, 0 refused."
```

The report lists the items sent, Ziffr's result for each, the periods that had no value yet, failed fetches, and slugs Ziffr does not list for the Feed: either the Feed is not a Submitter of that Metric yet, or its API Source is off.

## Limits

A Feed may make about 60 calls a minute and record 10,000 values a day, counted over all its keys. The runner sends at most 500 values per call and waits out a 429.

More, including n8n and the SQL Feed: [Feeds guide](https://github.com/ziffr/ziffr/blob/next/docs/guides/feeds.md).
