---
"@ziffr/web": patch
---

Thread replies and the text of Questions and Tasks are now stored encrypted with their Workspace's key on Installations with `ZIFFR_SECRETS_KEY`, so a database dump does not show them. Nothing changes on screen; text written before stays readable and is encrypted later.
