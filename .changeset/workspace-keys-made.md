---
"@ziffr/web": patch
---

Self-hosters: every Workspace now gets a Workspace Key of its own, made with it and stored only wrapped under a key derived from `ZIFFR_SECRETS_KEY` (spec 0028). Nothing is encrypted with it yet; that comes in the next steps, together with what to back up. An Installation without `ZIFFR_SECRETS_KEY` works as before.
