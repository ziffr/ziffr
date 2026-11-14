---
"@ziffr/web": patch
---

Self-hosters: the daily Workflow run and reminders sent in bulk now queue their emails, and the deliveries job (`POST /api/jobs/deliveries`) sends them within minutes, so a slow mail server no longer holds the run up. Keep that job scheduled every few minutes.
