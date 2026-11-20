---
"@ziffr/web": patch
---

Owners see under Workspace settings that the Workspace is encrypted with a key of its own, which deleting the Workspace destroys. Self-hosters: a Workspace's Slack bot token is now sealed with that key, so it goes with the Workspace; tokens connected before move to it the next time they are used.
