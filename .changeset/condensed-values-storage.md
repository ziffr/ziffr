---
"@ziffr/web": patch
---

Developers: Condensed Values have a table (their numbers sealed with the Workspace Key), charts and tables draw them with their note, and a value for a period they stand for is refused with "This period was condensed on …" (API: 409 `period_condensed`). Nothing makes a Condensed Value yet, so nothing changes for anyone until a Retention can be set. The Workspace's values file has two more columns, `period_end` and `condensed_from`, empty for ordinary values.
