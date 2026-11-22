---
"@ziffr/web": patch
---

The Ziffr Cloud API's `GET /api/cloud/v1/trial-limits` reports `days: null` with the source `invalid` when the server holds a wrong number of days, instead of the default of 14.
