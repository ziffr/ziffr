---
"@ziffr/web": minor
---

Trial Limits are numbers now. On hosted Ziffr, the days a trial lasts, its data's days after the end, the trials at once, and the Metrics, messages a day, keys, Feeds, assistants, Webhooks and View Links of a trial are set in one place: the new Trial Limits section of the Installation settings page, or by Ziffr Cloud through `PUT /api/cloud/v1/trial-limits`. A change applies to running trials at once, without a release, and lowering a limit never deletes what a trial has. Changed defaults: a trial may send 100 messages a day (it was 50), and 500 trials may run at once (it was 200). A cap on trials at once outside 1 to 100,000 in the environment now counts for nothing, instead of being taken as it is. Self-hosters: nothing changes; there are no trials without `ZIFFR_CLOUD_KEY`.
