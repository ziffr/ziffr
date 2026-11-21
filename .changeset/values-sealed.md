---
"@ziffr/web": minor
---

Self-hosters: a Workspace's numbers are now encrypted with its Workspace Key too: values, their history, Breakdown rows, Targets and Projections, Target Ranges, Metric names, the numbers frozen in Snapshots and frozen View Links, and the Check percentage and Tell levels of Workflows. A database dump or backup without `ZIFFR_SECRETS_KEY` then holds none of them. New values are written sealed at once and older ones are sealed by the re-encryption job in the background (watch it on the Installation Settings page); nothing stops while it runs. Keep `ZIFFR_SECRETS_KEY` (with Docker, the `ziffr_keys` volume) backed up apart from the database: without it the numbers are gone. An Installation without the key works as before and its numbers stay readable in the database.
