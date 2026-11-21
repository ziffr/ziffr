---
"@ziffr/web": minor
---

Retention now works. Once a confirmed Retention has started, a daily job condenses or deletes the Metric's old values in small steps, checks every Condensed Value against the original values before deleting them, leaves periods that open work holds, and never takes more than you confirmed. A delete offers a download of exactly what it will delete first. Self-hosters: the Docker clock calls the new `POST /api/jobs/retention` daily at 02:40 UTC; other setups should call it once a day with the job secret (see the jobs guide).
