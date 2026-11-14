---
"@ziffr/web": minor
---

Programs can submit values: `POST /api/v1/metrics/{slug}/observations` with a key that may submit values. The value goes through the same rules as one from a form or Slack (Submission Rule, Locks, Approvals), and the answer says whether it was recorded, waits for Approval or hit a locked period. Send an `Idempotency-Key` so a retry never records a value twice. Each key may submit 1,000 values a day. The Metric's history shows such values as from the API, with the key's name. Self-hosters: run the new migration.
