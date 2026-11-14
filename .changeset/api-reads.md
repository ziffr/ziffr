---
"@ziffr/web": minor
---

Programs can now read more through the API: a Metric's description (`GET /api/v1/metrics/{slug}`), its values for a range of periods with Breakdowns and whether each is recorded, waiting for Approval or locked (`/observations?from=&to=`), and the names of the workspace's people and Groups (`/people`, `/groups`). People come with id and name only, never an email or phone. A Metric the key's creator may not see answers 404, like one that doesn't exist.
