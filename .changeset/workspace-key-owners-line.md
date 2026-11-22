---
"@ziffr/web": patch
---

Owners see under Workspace settings that the Workspace is encrypted with a key of its own, which deleting the Workspace destroys. Self-hosters: a Workspace's Slack bot token is now sealed with that key, so it goes with the Workspace; tokens connected before are sealed again by the re-encryption job, or the next time they are used. A period's Workflow note (Approval reasons, a send-back comment) is stored encrypted too, and the re-encryption job covers it and the token.
