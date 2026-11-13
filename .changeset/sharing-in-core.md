---
"@ziffr/web": minor
---

Developers: creating Metrics and uploading their series, sharing, "who can see this", access requests, Groups and Contacts go through the core (`@ziffr/core/metrics`, `sharing`, `team`), with permission tests against the database. What a person sees is loaded in `@ziffr/core/access` and `workspace-data`.
