---
"@ziffr/web": patch
---

Analysis refuses values it cannot work out exactly in reasonable time, and says why: values with more than 30 decimal places, values spanning more than 30 orders of magnitude, and a fit of several Metrics on values that need too much work. Before, a few such values sent in through an API key, a Feed or a form could keep the server busy for many seconds, and anyone opening a shared view started the work.
