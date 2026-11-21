---
"@ziffr/web": minor
---

Self-hosters: data written before the upgrade is now sealed with each Workspace's key by a job, a few hundred rows at a time, while Ziffr keeps running; Docker's clock calls `/api/jobs/workspace-keys` every five minutes, other setups call it from their scheduler. Installation Admins see how far it is, and which key versions each Workspace has, under Encryption of Workspaces on the Installation settings page, never a key. Back up `ZIFFR_SECRETS_KEY` apart from the database first: without it, sealed data cannot be read.
