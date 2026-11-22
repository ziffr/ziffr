# @ziffr/feed-github

The GitHub Feed for [Ziffr](https://github.com/ziffr/ziffr): reads a repository's public download counts, stars and forks from GitHub's API (no secret needed) and sends them with a Feed Key into a Workspace, as Metrics. Built on [`@ziffr/feed-kit`](../feed-kit/README.md). MIT licensed, Node 20 or later.

The download counts are requests GitHub served for release assets, bots and retries included. They are not running Installations. Setup, the Metrics and what GitHub does not offer: [GitHub Feed guide](../../docs/guides/github-feed.md).

```sh skip="needs a Feed Key and reaches GitHub"
export ZIFFR_GITHUB_FEED_KEY=zk_...                    # Settings, Feeds, in the Workspace that holds the numbers
export ZIFFR_GITHUB_FEED_URL=https://app.ziffr.net     # where that Workspace runs
export ZIFFR_GITHUB_REPO=ziffr/ziffr                   # the default
ziffr-feed-github run --dry-run                        # shows what it would send
```

It is off while the Feed Key is missing: it says so, sends nothing and exits 0. `GITHUB_TOKEN` is optional and only lifts GitHub's rate limit.
