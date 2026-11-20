---
"@ziffr/web": minor
---

Owners and Admins can now add Webhooks under Workspace settings: an address that gets signed messages about tasks and values. They choose the events, see the secret once, send a test event, read the log, send a failed message again, replace the secret and switch a Webhook off. Messages leave in clear text over TLS, and the page says so.
