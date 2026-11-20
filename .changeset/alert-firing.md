---
"@ziffr/web": patch
---

Developers: Alerts now fire. A value that counts (recorded, approved, corrected or recomputed) is checked against each Alert once, in the core's one submit path, and the day after a Due Date the Workflow run checks "not in". A message goes through the person's Delivery Preference as a Delivery of the new kind `alert`: once per crossing, never for an Import, never to someone who cannot see the Metric, with the daily limits kept in the database, and it cannot be answered.
