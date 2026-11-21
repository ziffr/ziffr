---
"@ziffr/web": patch
---

A flood of unsigned requests to a Webhook's inbound address is now stopped early (429) per Webhook and per network address, before Ziffr looks the Webhook up. Senders that stay under the limit are not affected.
