---
"@ziffr/web": patch
---

Deleting a trial now destroys its Workspace Key before anything else, and the Installation settings page lists the deletion by the Workspace's id, never its name. Self-hosters: a deleted Workspace is unreadable in backups after your backup retention period; backups from before the deletion still open until they expire.
