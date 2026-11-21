---
"@ziffr/web": minor
---

Self-hosters: with `ZIFFR_SECRETS_KEY` set, the labels of Breakdown rows (and the row an Action points at) are now sealed with the Workspace's key like other Workspace text. Values still add up by label; rows from before stay readable until the re-encryption job seals them.
