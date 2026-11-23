---
"@ziffr/web": minor
---

A Pack can now say which of Ziffr's n8n templates fill which of its Metrics (`feeds` in its manifest). After Set up from this Pack, the page offers the download for exactly those Metrics, with the template already chosen. Developers: `@ziffr/pack` checks the new field and exports `FEED_TEMPLATE_IDS`.
