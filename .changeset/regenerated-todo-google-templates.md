---
"@ziffr/web": patch
---

The Microsoft To Do and Google Tasks workflows now carry the same checks as the newer templates: the repeat check uses the signed message id, ids are checked before use, an existing task is only taken over when it holds exactly what the workflow wrote, and a network error no longer throws away what was already sent. Import the files again.
