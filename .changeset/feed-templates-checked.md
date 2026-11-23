---
"@ziffr/web": patch
---

The n8n templates for Feeds no longer send a past period that already has a value, so running one again never overwrites, adds to or doubles it; they run in UTC, and the Stripe template counts a cancellation on the day the subscription ended. An independent security review of the templates is in `docs/reviews/`.
