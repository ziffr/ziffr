---
"@ziffr/web": patch
---

Self-hosters: a Workspace that held values with a Breakdown could not be deleted, so an ended trial, an unused Workspace or a failed import stayed. After this update the next run deletes them; a trial left without its key by a stopped deletion is finished too.
