---
"@ziffr/web": patch
---

Security: a Webhook's status-back request could be replayed within its five minutes by padding or extending the signature header; a request is now taken once by its timestamp and body, and a signature header with anything but one or two well-formed signatures is refused.
