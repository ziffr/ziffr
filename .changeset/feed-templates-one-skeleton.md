---
"@ziffr/web": patch
---

The n8n templates for Feeds now share one checking step, so every template, present and future, validates each value, leaves out a past period that already has one and keeps one key for the same figures. No change for people who already use them.
