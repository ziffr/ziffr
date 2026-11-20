---
"@ziffr/web": minor
---

Self-hosters: with a default Workspace Limit, `ZIFFR_DELETE_UNUSED_AFTER_DAYS` (also on the Installation Settings page) deletes Workspaces on the default limit that nobody signed in to or sent a value to for that many days, after one warning to their Owners and 14 more days, key first. The scheduler calls `POST /api/jobs/unused-workspaces` daily (Docker Compose does). Owners and Admins can download the values of the Metrics they see from `/settings/workspace/download`.
