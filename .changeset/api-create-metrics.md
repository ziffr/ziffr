---
"@ziffr/web": minor
---

Programs can create metrics: `POST /api/v1/metrics` with a key that may create metrics. The metric belongs to the key's creator, who can be made its Submitter in the same call, and an `Idempotency-Key` keeps a retry from making two. See the API guide.
