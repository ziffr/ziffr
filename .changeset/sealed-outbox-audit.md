---
"@ziffr/web": patch
---

The Outbox, the messages that came in and the Audit Log's names and details are now stored encrypted with their Workspace's key on Installations with `ZIFFR_SECRETS_KEY`. A message whose text can no longer be read is never sent. Nothing changes on screen.
