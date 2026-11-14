---
"@ziffr/web": patch
---

The retry job for email now picks the emails that are due in the database, so emails waiting out a limit can never keep others from going out. Self-hosters: run the new migration.
