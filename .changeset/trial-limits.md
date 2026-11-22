---
"@ziffr/web": minor
---

Trial Limits are numbers now. On hosted Ziffr, the days a trial lasts, its data's days after the end, the trials at once, and the Metrics, messages a day, keys, Feeds, assistants, Webhooks and View Links of a trial are set in one place: the new Trial Limits section of the Installation settings page, or by Ziffr Cloud through `PUT /api/cloud/v1/trial-limits`. A change applies to running trials at once, without a release, and lowering a limit never deletes what a trial has. A trial now sends up to 100 messages a day (it was 50), and trials at once default to 500 (it was 200). Self-hosters: nothing changes; there are no trials without `ZIFFR_CLOUD_KEY`.
