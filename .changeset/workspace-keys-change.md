---
"@ziffr/web": minor
---

Self-hosters: an Installation Admin can now change a Workspace's key from the Installation settings page (Change key, under Encryption of Workspaces), and the Installation's own key can be changed once a year without downtime: set the old key in `ZIFFR_SECRETS_KEY_PREVIOUS`, the new one in `ZIFFR_SECRETS_KEY`, restart, and the job wraps every Workspace Key again; the page says when the old key can go. The encryption job now also seals what it had left in clear: the words of Findings, Snapshots, Versions and View Links, Breakdown labels with their history, and the external tasks Webhooks link. See "Changing keys" in the self-hosting guide.
