# @ziffr/feed-usage

The Usage Feed for [Ziffr](https://github.com/ziffr/ziffr): reads an Installation's daily Usage totals with a Usage Key and sends them with a Feed Key into your own Workspace, as Metrics. Built on [`@ziffr/feed-kit`](../feed-kit/README.md). MIT licensed, Node 20 or later.

The totals are counts across all Workspaces: never a Workspace's name, a Metric or a person. Setup, the figures, the Workspace Limit and what happens when the Installation is down: [Usage guide](../../docs/guides/usage.md).

```sh
export ZIFFR_USAGE_KEY=zu_...          # Installation Settings, Make a Usage Key
export ZIFFR_USAGE_FEED_KEY=zk_...     # Settings, Feeds, in the Workspace that holds the numbers
export ZIFFR_USAGE_SOURCE_URL=https://ziffr.example.com
ziffr-feed-usage run --dry-run         # shows what it would send
ziffr-feed-usage run --backfill 7      # also fills the 7 periods before this one where they are empty
```

It is off while either key is missing: it says so and sends nothing. `ZIFFR_USAGE_FEED_URL` names the Installation that holds your Workspace when it is not the one you read from. Docker Compose runs it daily at 05:00 UTC.
