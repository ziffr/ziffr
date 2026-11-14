---
"@ziffr/web": minor
---

Ziffr can send real email: Prompts, reminders, questions, tasks and replies by the Email Connector now go out through your SMTP server, with links back into Ziffr. The Outbox shows whether each was emailed, is waiting or failed. Self-hosters: run the new migration, set `ZIFFR_SMTP_URL` and `ZIFFR_MAIL_FROM` (and `ZIFFR_SITE_URL`, for the links) to turn sending on (without them nothing is sent, as before), and have a scheduler call `POST /api/jobs/deliveries` with `ZIFFR_JOB_SECRET` to retry failed sends. The demo never sends.
