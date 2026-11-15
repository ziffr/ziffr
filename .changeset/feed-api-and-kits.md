---
"@ziffr/web": minor
---

Developers: a Feed Key reads `GET /api/v1/feed` and records up to 500 values per call with `POST /api/v1/feed/observations`, with one result per item. The SDK has `feed.get`, `feed.metrics` and `feed.submit`. The new MIT packages `@ziffr/feed-kit` (`defineFeed` and `ziffr-feed run`) and `@ziffr/feed-sql` (one Postgres query per Metric) write and run Feeds. See docs/guides/feeds.md.
